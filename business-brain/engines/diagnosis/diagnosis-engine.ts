/**
 * Business Brain — Diagnosis Engine (implementation)
 *
 * Thin wrapper that puts the pure core into the uniform `EngineResult` envelope:
 * it derives the clinic from the execution context, takes `now` from
 * `context.startedAt` rather than any clock, and reports one decision trace per
 * pattern matcher — including the non-matches, with the reason.
 *
 * Confidence is reported honestly. When nothing was produced it reports matcher
 * decidability rather than 1.0, because "we found no pattern" and "we could not
 * look" are different results.
 *
 * As with the Signal Engine, `execute` is `async` because `BaseEngine.execute`
 * (the repo-wide engine contract) returns a Promise. The synchronous form is
 * exposed as {@link DentGrowDiagnosisEngine.run}, which `execute` awaits. No I/O
 * happens in either path.
 */

import type { Diagnosis } from "../../domain";
import type { EngineResult, ExecutionContext } from "../../types";
import { logger, type Logger } from "../../utils";
import { DiagnosisEngine, type DiagnosisEngineQuery } from "../diagnosis-engine";
import type { DeepPartial, DiagnosisConfig } from "./config/diagnosis-config";
import { evaluateDiagnoses } from "./diagnose";

/** Construction options for {@link DentGrowDiagnosisEngine}. */
export interface DiagnosisEngineOptions {
  readonly enabled?: boolean;
  readonly logger?: Logger;
  /** Configuration overrides applied to every run of this instance. */
  readonly config?: DeepPartial<DiagnosisConfig>;
}

/**
 * The DentGrow Diagnosis Engine.
 *
 * Reads signals, traces, and metrics only. No database access, no repositories,
 * no AI, no clock. Produces correlated patterns with competing hypotheses — never
 * recommendations.
 */
export class DentGrowDiagnosisEngine extends DiagnosisEngine {
  private readonly log: Logger;
  private readonly config?: DeepPartial<DiagnosisConfig>;

  constructor(options?: DiagnosisEngineOptions) {
    super(options?.enabled ?? true);
    this.log = options?.logger ?? logger;
    this.config = options?.config;
  }

  /**
   * Synchronous engine run. Everything the engine does is pure computation, so
   * this is the primary entry point; `execute` wraps it for contract
   * compatibility.
   */
  run(
    input: DiagnosisEngineQuery,
    context: ExecutionContext,
  ): EngineResult<Diagnosis[]> {
    const now = context.startedAt;
    const result = evaluateDiagnoses({
      current: input.current,
      history: input.history,
      historyMetricsOnly: input.historyMetricsOnly,
      clinicId: context.clinicId,
      now,
      config: this.config,
    });

    if (result.error) {
      this.log.warn("Diagnosis Engine rejected its input", {
        engine: this.name,
        clinicId: context.clinicId,
        correlationId: context.correlationId,
        date: input.current.date,
        code: result.error.code,
      });
      return {
        ok: false,
        data: null,
        error: result.error,
        trace: result.traces,
        generatedAt: now,
      };
    }

    return {
      ok: true,
      data: [...result.diagnoses],
      confidence: result.confidence,
      trace: result.traces,
      generatedAt: now,
    };
  }

  /** Engine contract entry point. Delegates to {@link run}; performs no I/O. */
  async execute(
    input: DiagnosisEngineQuery,
    context: ExecutionContext,
  ): Promise<EngineResult<Diagnosis[]>> {
    return this.run(input, context);
  }
}
