/**
 * Business Brain — Pipeline orchestration
 *
 * Composes the three deterministic engines into a single run for one clinic-day:
 *
 *   repository -> Metrics Engine -> Signal Engine -> Diagnosis Engine
 *
 * This file contains NO business logic. It resolves dependencies, threads one
 * `ExecutionContext` through every stage, converts each engine's `EngineResult`
 * into a recorded stage outcome, and assembles the result. Every threshold,
 * every rule and every judgement stays inside the engine that owns it.
 *
 * READ-ONLY BY CONSTRUCTION
 * -------------------------
 * The only external call is `MetricsDataRepository.getClinicSnapshot`, whose
 * contract is a read. The engines are pure functions over their inputs. There
 * is no write path here — no persistence, no notifications, no task creation,
 * no automation trigger, and no LLM call. `business-brain/` imports no database
 * client at all, so this cannot change by accident.
 *
 * DETERMINISM
 * -----------
 * Given the same data, two runs produce identical metrics, signals and
 * diagnoses. The engines never read a clock: `now` comes from
 * `context.startedAt`, which the caller may inject. Only the timing fields in
 * the execution metadata vary between runs, and they are deliberately kept out
 * of the payload so a caller can compare results directly.
 */

import type { Diagnosis, Metric, Signal } from "../domain";
import type {
  Confidence,
  DecisionTrace,
  EngineError,
  ExecutionContext,
} from "../types";
import type { MetricsDataRepository } from "../repositories";
import { logger, type Logger } from "../utils";
import { DentGrowMetricsEngine } from "../engines/metrics";
import { DentGrowSignalEngine } from "../engines/signals";
import {
  DentGrowDiagnosisEngine,
  addDays,
  isIsoDate,
  type DeepPartial as DiagnosisDeepPartial,
  type DiagnosisConfig,
} from "../engines/diagnosis";
import type { MetricsOnlyDay } from "../engines/diagnosis-engine";
import type { DeepPartial, SignalThresholdConfig } from "../engines/signals";

/**
 * Contract version of the pipeline this service runs.
 *
 * Phases completed: Metrics (3), Signal (4), Diagnosis (5). Bump it when the
 * shape of a stage's output changes, so a stored or cached result can be told
 * apart from one produced by a later pipeline.
 */
export const BUSINESS_BRAIN_VERSION = "0.5.0";

/** The stages a run passes through, in order. */
export const BusinessBrainStageName = {
  METRICS: "metrics",
  SIGNALS: "signals",
  DIAGNOSIS: "diagnosis",
} as const;
export type BusinessBrainStageName =
  (typeof BusinessBrainStageName)[keyof typeof BusinessBrainStageName];

/** What happened in one stage. Recorded whether it succeeded or not. */
export interface BusinessBrainStage {
  readonly stage: BusinessBrainStageName;
  /** False when the engine rejected its input; the run stops after this stage. */
  readonly ok: boolean;
  /** Whether the stage ran at all — false when an earlier stage failed. */
  readonly executed: boolean;
  /** Number of items produced (metrics, signals, diagnoses). */
  readonly outputCount: number;
  readonly durationMs: number;
  /** The engine's own confidence in its output, where it reports one. */
  readonly confidence?: Confidence;
  readonly error?: EngineError;
}

/** Non-deterministic metadata about a run. Never part of the compared payload. */
export interface BusinessBrainExecution {
  readonly clinicId: string;
  readonly date: string;
  readonly correlationId: string;
  /** Logical run time — the `now` every engine reasoned against. */
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly version: string;
  /** Prior days requested for persistence analysis. */
  readonly historyDaysRequested: number;
  /** Prior days actually loaded; fewer means some could not be read. */
  readonly historyDaysLoaded: number;
  readonly stages: readonly BusinessBrainStage[];
}

/** The complete output of one pipeline run. */
export interface BusinessBrainResult {
  readonly clinicId: string;
  readonly date: string;
  /** True when every stage completed. Partial results are still returned. */
  readonly ok: boolean;
  readonly metrics: readonly Metric[];
  readonly signals: readonly Signal[];
  readonly diagnoses: readonly Diagnosis[];
  /** Combined decision trace from the Signal and Diagnosis engines. */
  readonly trace: readonly DecisionTrace[];
  readonly execution: BusinessBrainExecution;
  /** Set when a stage rejected its input; identifies the first failure. */
  readonly error?: EngineError;
}

/** Construction dependencies. The repository is the only external collaborator. */
export interface BusinessBrainDependencies {
  readonly repository: MetricsDataRepository;
  readonly logger?: Logger;
  /** Threshold overrides forwarded to the Signal Engine. */
  readonly signalConfig?: DeepPartial<SignalThresholdConfig>;
  /** Configuration overrides forwarded to the Diagnosis Engine. */
  readonly diagnosisConfig?: DiagnosisDeepPartial<DiagnosisConfig>;
  /**
   * Monotonic millisecond source for stage timing. Injectable so tests can make
   * timing deterministic; it never influences engine output.
   */
  readonly clock?: () => number;
}

/** Per-run options. */
export interface RunBusinessBrainOptions {
  /** Ties every stage's logs together. Generated when omitted. */
  readonly correlationId?: string;
  /**
   * Logical run time (ISO-8601) used as `now` by the Signal and Diagnosis
   * engines. Inject it to make a run exactly reproducible.
   */
  readonly startedAt?: string;
  /**
   * How many prior days to load as metrics-only history, so the Diagnosis
   * Engine can classify persistence (is this transient, sustained, worsening?).
   *
   * Defaults to 0 — a single day. With no history every diagnosis is correctly
   * reported as `insufficient_history`. The Diagnosis Engine's
   * `minimumHistoryDays` is 3, so 7 is a sensible production value.
   */
  readonly historyDays?: number;
  readonly requestedBy?: string;
  readonly role?: string;
}

function stage(
  name: BusinessBrainStageName,
  fields: Partial<BusinessBrainStage> = {},
): BusinessBrainStage {
  return {
    stage: name,
    ok: false,
    executed: false,
    outputCount: 0,
    durationMs: 0,
    ...fields,
  };
}

/**
 * Runs the deterministic Business Brain pipeline for a clinic-day.
 *
 * Construct once with a repository, then call {@link runBusinessBrain} per
 * clinic-day. The service holds no per-run state.
 */
export class BusinessBrain {
  private readonly repository: MetricsDataRepository;
  private readonly log: Logger;
  private readonly clock: () => number;
  private readonly metricsEngine: DentGrowMetricsEngine;
  private readonly signalEngine: DentGrowSignalEngine;
  private readonly diagnosisEngine: DentGrowDiagnosisEngine;

  constructor(deps: BusinessBrainDependencies) {
    this.repository = deps.repository;
    this.log = deps.logger ?? logger;
    this.clock = deps.clock ?? (() => Date.now());
    this.metricsEngine = new DentGrowMetricsEngine(deps.repository, { logger: this.log });
    this.signalEngine = new DentGrowSignalEngine({ logger: this.log, config: deps.signalConfig });
    this.diagnosisEngine = new DentGrowDiagnosisEngine({
      logger: this.log,
      config: deps.diagnosisConfig,
    });
  }

  /**
   * Execute the full pipeline for one clinic-day.
   *
   * Never throws for a stage failure: a rejected stage is recorded, the run
   * stops there, and everything already produced is still returned. A caller
   * rendering a dashboard can show the metrics it has even when diagnosis could
   * not run.
   */
  async runBusinessBrain(
    clinicId: string,
    date: string,
    options: RunBusinessBrainOptions = {},
  ): Promise<BusinessBrainResult> {
    const startedAtMs = this.clock();
    const startedAt = options.startedAt ?? new Date(startedAtMs).toISOString();
    const correlationId = options.correlationId ?? `bb_${clinicId}_${date}_${startedAtMs}`;
    const historyDays = Math.max(0, options.historyDays ?? 0);

    const context: ExecutionContext = {
      clinicId,
      correlationId,
      startedAt,
      requestedBy: options.requestedBy,
      role: options.role,
    };

    const stages: BusinessBrainStage[] = [];
    const finish = (
      fields: Pick<BusinessBrainResult, "metrics" | "signals" | "diagnoses" | "trace"> & {
        error?: EngineError;
        historyDaysLoaded: number;
      },
    ): BusinessBrainResult => {
      const completedMs = this.clock();
      return {
        clinicId,
        date,
        ok: fields.error === undefined,
        metrics: fields.metrics,
        signals: fields.signals,
        diagnoses: fields.diagnoses,
        trace: fields.trace,
        error: fields.error,
        execution: {
          clinicId,
          date,
          correlationId,
          startedAt,
          completedAt: new Date(completedMs).toISOString(),
          durationMs: completedMs - startedAtMs,
          version: BUSINESS_BRAIN_VERSION,
          historyDaysRequested: historyDays,
          historyDaysLoaded: fields.historyDaysLoaded,
          stages,
        },
      };
    };

    // Reject a malformed date here rather than letting three engines each
    // discover it separately.
    if (!isIsoDate(date)) {
      const error: EngineError = {
        code: "BUSINESS_BRAIN_INVALID_DATE",
        message: `Not a valid calendar date: "${date}".`,
      };
      stages.push(stage(BusinessBrainStageName.METRICS, { error }));
      stages.push(stage(BusinessBrainStageName.SIGNALS));
      stages.push(stage(BusinessBrainStageName.DIAGNOSIS));
      return finish({ metrics: [], signals: [], diagnoses: [], trace: [], error, historyDaysLoaded: 0 });
    }

    // ── Stage 1: Metrics ─────────────────────────────────────────────────────
    const metricsStart = this.clock();
    const metricsResult = await this.metricsEngine.execute({ date }, context);
    stages.push(
      stage(BusinessBrainStageName.METRICS, {
        ok: metricsResult.ok,
        executed: true,
        outputCount: metricsResult.data?.length ?? 0,
        durationMs: this.clock() - metricsStart,
        confidence: metricsResult.confidence,
        error: metricsResult.error,
      }),
    );

    if (!metricsResult.ok || !metricsResult.data) {
      stages.push(stage(BusinessBrainStageName.SIGNALS));
      stages.push(stage(BusinessBrainStageName.DIAGNOSIS));
      return finish({
        metrics: [],
        signals: [],
        diagnoses: [],
        trace: [],
        error: metricsResult.error,
        historyDaysLoaded: 0,
      });
    }
    const metrics = metricsResult.data;

    // History is optional context for persistence classification. A day that
    // cannot be read is skipped rather than failing the run — the Diagnosis
    // Engine treats a gap as `unknown`, which is the correct outcome.
    const history = historyDays > 0 ? await this.loadHistory(clinicId, date, historyDays) : [];

    // ── Stage 2: Signals ─────────────────────────────────────────────────────
    const signalsStart = this.clock();
    const signalResult = this.signalEngine.run({ metrics, date }, context);
    stages.push(
      stage(BusinessBrainStageName.SIGNALS, {
        ok: signalResult.ok,
        executed: true,
        outputCount: signalResult.data?.length ?? 0,
        durationMs: this.clock() - signalsStart,
        confidence: signalResult.confidence,
        error: signalResult.error,
      }),
    );

    const signalTrace = signalResult.trace ?? [];
    if (!signalResult.ok || !signalResult.data) {
      stages.push(stage(BusinessBrainStageName.DIAGNOSIS));
      return finish({
        metrics,
        signals: [],
        diagnoses: [],
        trace: signalTrace,
        error: signalResult.error,
        historyDaysLoaded: history.length,
      });
    }
    const signals = signalResult.data;

    // ── Stage 3: Diagnosis ───────────────────────────────────────────────────
    // The Signal Engine's trace is passed through deliberately: without it the
    // Diagnosis Engine cannot tell a signal that measured nothing from one that
    // could not run, and those two absences lead to different diagnoses.
    const diagnosisStart = this.clock();
    const diagnosisResult = this.diagnosisEngine.run(
      {
        current: { date, signals, metrics, trace: signalTrace },
        historyMetricsOnly: history,
      },
      context,
    );
    stages.push(
      stage(BusinessBrainStageName.DIAGNOSIS, {
        ok: diagnosisResult.ok,
        executed: true,
        outputCount: diagnosisResult.data?.length ?? 0,
        durationMs: this.clock() - diagnosisStart,
        confidence: diagnosisResult.confidence,
        error: diagnosisResult.error,
      }),
    );

    const trace = [...signalTrace, ...(diagnosisResult.trace ?? [])];
    return finish({
      metrics,
      signals,
      diagnoses: diagnosisResult.data ?? [],
      trace,
      error: diagnosisResult.error,
      historyDaysLoaded: history.length,
    });
  }

  /**
   * Load the `days` calendar days immediately before `date` as metrics-only
   * history, ascending. A day whose snapshot cannot be read is omitted and
   * logged; the Diagnosis Engine reconstructs the gap as `unknown`.
   */
  private async loadHistory(
    clinicId: string,
    date: string,
    days: number,
  ): Promise<MetricsOnlyDay[]> {
    const wanted: string[] = [];
    for (let offset = days; offset >= 1; offset -= 1) {
      wanted.push(addDays(date, -offset));
    }

    const loaded = await Promise.all(
      wanted.map(async (day): Promise<MetricsOnlyDay | null> => {
        try {
          return { date: day, metrics: await this.metricsEngine.calculateMetrics(clinicId, day) };
        } catch (error) {
          this.log.warn("Business Brain could not load a history day; treating it as unknown", {
            clinicId,
            date: day,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }),
    );

    return loaded.filter((day): day is MetricsOnlyDay => day !== null);
  }
}

/**
 * Convenience wrapper for a one-off run.
 *
 * Prefer constructing {@link BusinessBrain} once and reusing it when running
 * for several clinics or dates — it builds three engines per construction.
 */
export async function runBusinessBrain(
  deps: BusinessBrainDependencies,
  clinicId: string,
  date: string,
  options?: RunBusinessBrainOptions,
): Promise<BusinessBrainResult> {
  return new BusinessBrain(deps).runBusinessBrain(clinicId, date, options);
}
