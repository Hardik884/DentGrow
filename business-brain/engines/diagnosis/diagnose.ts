/**
 * Business Brain — Diagnosis Engine: pure core
 *
 * Reads Signals, DecisionTraces, and Metrics; returns Diagnoses. Nothing else: no
 * database, no repositories, no clock, no randomness, no network, no LLM. It emits
 * no metrics and no signals, and it recommends nothing. The boundary is enforced by
 * the `no-restricted-imports` rule scoped to this directory in `eslint.config.mjs`.
 *
 * One upstream dependency is permitted and used: the Signal Engine's PURE core
 * (`evaluateSignals`), so historical signals can be re-derived from historical
 * metrics when the caller supplies metrics only. The `DentGrowSignalEngine`
 * wrapper is deliberately NOT imported — that is where I/O will eventually live.
 *
 * Determinism is a hard requirement. `now` is injected, ids are stable slugs,
 * derived values are rounded to a fixed precision, and output order is a canonical
 * sort by pattern then id — never by severity or confidence, because ranking is a
 * later phase's job.
 */

import {
  DiagnosisPattern,
  SignalType,
  type Diagnosis,
  type Metric,
  type Signal,
} from "../../domain";
import type { Confidence, DecisionTrace, EngineError, Evidence } from "../../types";
import type { MetricsOnlyDay, SignalRun } from "../diagnosis-engine";
import { evaluateSignals } from "../signals/generate-signals";
import { buildMetricIndex, type MetricIndex } from "../signals/support/metric-index";
import { round2 } from "../signals/support/numbers";
import {
  resolveDiagnosisConfig,
  type DeepPartial,
  type DiagnosisConfig,
} from "./config/diagnosis-config";
import { MATCHERS } from "./matchers/registry";
import type { MatcherContext, PatternMatcher } from "./matchers/types";
import { matchUnclustered } from "./matchers/unclustered";
import { diagnosisEvidence } from "./support/hypothesis-builder";
import { isIsoDate } from "./support/dates";
import { buildHistoryWindow, type HistoryWindow } from "./support/persistence";
import { buildSignalIndex, signalClinicOf, type SignalIndex } from "./support/signal-index";

/** Engine name used in traces and evidence. */
export const DIAGNOSIS_ENGINE_NAME = "DiagnosisEngine";

/** Typed error codes this engine can return. */
export const DiagnosisEngineErrorCode = {
  MIXED_CLINIC: "DIAGNOSIS_ENGINE_MIXED_CLINIC",
  INVALID_DATE: "DIAGNOSIS_ENGINE_INVALID_DATE",
} as const;

export type DiagnosisEngineErrorCode =
  (typeof DiagnosisEngineErrorCode)[keyof typeof DiagnosisEngineErrorCode];

/**
 * Input to the pure diagnosis core.
 *
 * `SignalRun` carries the Signal Engine's decision trace as a REQUIRED field.
 * Without it, an absent signal is just an absence, and this engine cannot tell
 * "the cancellation evaluator found nothing" from "the cancellation evaluator
 * could not run" — a distinction that changes both the hypotheses and the
 * confidence.
 */
export interface DiagnosisEngineInput {
  readonly current: SignalRun;
  /** Prior days, ascending by date. Supplied by the caller; never fetched. */
  readonly history?: readonly SignalRun[];
  /** Prior days as metrics only; signals are re-derived from them. */
  readonly historyMetricsOnly?: readonly MetricsOnlyDay[];
  readonly clinicId: string;
  /** Injected ISO-8601 timestamp. The engine never reads the system clock. */
  readonly now: string;
  readonly config?: DeepPartial<DiagnosisConfig>;
}

/** Full result of a diagnosis run, including explainability and validation. */
export interface DiagnosisEvaluationResult {
  readonly diagnoses: readonly Diagnosis[];
  readonly traces: readonly DecisionTrace[];
  /**
   * Mean confidence of the emitted diagnoses.
   *
   * When nothing was emitted there is no mean to report, so this is MATCHER
   * DECIDABILITY instead: the fraction of pattern matchers whose declared
   * required signals all reached a verdict in the signal run. A quiet run over
   * complete data reports 1 — the engine looked at everything and found no
   * pattern. A run where the underlying evaluators could not execute reports low,
   * because the engine did not actually rule anything out.
   *
   * Undefined only when there are no matchers to assess.
   */
  readonly confidence?: Confidence;
  readonly confidenceBasis: "emitted_diagnoses" | "matcher_decidability" | "none";
  /** Present only when the input was rejected. */
  readonly error?: EngineError;
}

/** Canonical pattern order for the output sort: the enum's declaration order. */
const PATTERN_ORDER: readonly string[] = Object.values(DiagnosisPattern);

/** Every signal type the current Signal Engine can emit. */
const ALL_SIGNAL_TYPES: readonly SignalType[] = Object.values(SignalType);

function patternRank(diagnosis: Diagnosis): number {
  const index = PATTERN_ORDER.indexOf(diagnosis.pattern);
  return index === -1 ? PATTERN_ORDER.length : index;
}

/** Stable sort by pattern then id. Locale-independent string comparison. */
function sortCanonically(diagnoses: readonly Diagnosis[]): Diagnosis[] {
  return [...diagnoses].sort((a, b) => {
    const byPattern = patternRank(a) - patternRank(b);
    if (byPattern !== 0) return byPattern;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}

function trace(params: {
  readonly step: string;
  readonly reasoning: string;
  readonly timestamp: string;
  readonly evidence?: readonly Evidence[];
  readonly confidence?: Confidence;
}): DecisionTrace {
  return {
    engine: DIAGNOSIS_ENGINE_NAME,
    step: params.step,
    reasoning: params.reasoning,
    evidence: params.evidence ?? [],
    confidence: params.confidence,
    timestamp: params.timestamp,
  };
}

function rejection(
  code: DiagnosisEngineErrorCode,
  message: string,
  details: unknown,
  now: string,
): DiagnosisEvaluationResult {
  const error: EngineError = { code, message, details };
  return {
    diagnoses: [],
    traces: [trace({ step: "validate-input", reasoning: message, timestamp: now })],
    confidenceBasis: "none",
    error,
  };
}

/** Clinics referenced by a run's signals and metrics. */
function clinicsIn(run: {
  readonly signals: readonly Signal[];
  readonly metrics: readonly Metric[];
}): Set<string> {
  const clinics = new Set<string>();
  for (const signal of run.signals) {
    const clinic = signalClinicOf(signal);
    if (clinic) clinics.add(clinic);
  }
  const built = buildMetricIndex(run.metrics);
  if (built.ok && built.index.clinicId) clinics.add(built.index.clinicId);
  return clinics;
}

interface PreparedHistoryDay {
  readonly date: string;
  readonly index: SignalIndex;
  readonly derived: boolean;
  readonly evaluatedTypes: readonly SignalType[];
}

/**
 * Re-derive one day's signals from its metrics using the Signal Engine's pure
 * core. `previous` is the day before it, so the trend evaluators can run rather
 * than skipping — which keeps a re-derived day comparable to a supplied one.
 */
function deriveDay(
  day: MetricsOnlyDay,
  previous: MetricsOnlyDay | undefined,
  input: DiagnosisEngineInput,
  config: DiagnosisConfig,
): { readonly index: SignalIndex; readonly note: string } {
  const result = evaluateSignals({
    metrics: day.metrics,
    previousMetrics: previous?.metrics,
    clinicId: input.clinicId,
    date: day.date,
    now: input.now,
    config: config.signals,
  });
  return {
    index: buildSignalIndex(result.signals, result.traces),
    note: `Re-derived ${result.signals.length} signal(s) for ${day.date} from ${day.metrics.length} supplied metric(s)${previous ? ` with ${previous.date} as the prior period` : " with no prior period available"}.`,
  };
}

/** Prepare the history window from whichever form the caller supplied. */
function prepareHistory(
  input: DiagnosisEngineInput,
  config: DiagnosisConfig,
): { readonly window: HistoryWindow; readonly notes: readonly string[] } {
  const notes: string[] = [];
  const prepared: PreparedHistoryDay[] = [];

  for (const run of input.history ?? []) {
    prepared.push({
      date: run.date,
      index: buildSignalIndex(run.signals, run.trace),
      derived: false,
      evaluatedTypes: ALL_SIGNAL_TYPES,
    });
  }

  if (input.historyMetricsOnly && input.historyMetricsOnly.length > 0) {
    const ascending = [...input.historyMetricsOnly].sort((a, b) =>
      a.date === b.date ? 0 : a.date < b.date ? -1 : 1,
    );
    ascending.forEach((day, position) => {
      if (prepared.some((existing) => existing.date === day.date)) {
        notes.push(
          `Skipped re-deriving ${day.date}: a full signal run was already supplied for that date.`,
        );
        return;
      }
      const derived = deriveDay(day, ascending[position - 1], input, config);
      notes.push(derived.note);
      prepared.push({
        date: day.date,
        index: derived.index,
        derived: true,
        evaluatedTypes: ALL_SIGNAL_TYPES,
      });
    });
  }

  const window = buildHistoryWindow({
    currentDate: input.current.date,
    supplied: prepared,
  });
  return { window, notes: [...notes, ...window.notes] };
}

/** Run one matcher with failure isolation. One broken rule must not fail the run. */
function runMatcher(
  matcher: PatternMatcher,
  ctx: MatcherContext,
): { readonly diagnoses: readonly Diagnosis[]; readonly trace: DecisionTrace } {
  try {
    const outcome = matcher.match(ctx);
    if (outcome.kind === "matched") {
      return {
        diagnoses: outcome.diagnoses,
        trace: trace({
          step: matcher.pattern,
          reasoning: `Matched: ${outcome.diagnoses.map((d) => d.summary).join(" ")}`,
          timestamp: ctx.now,
          confidence: outcome.diagnoses[0]?.confidence,
        }),
      };
    }
    return {
      diagnoses: [],
      trace: trace({
        step: matcher.pattern,
        reasoning: `Not matched: ${outcome.reason}`,
        timestamp: ctx.now,
      }),
    };
  } catch (error) {
    return {
      diagnoses: [],
      trace: trace({
        step: matcher.pattern,
        reasoning: `Not matched: matcher threw (${error instanceof Error ? error.message : String(error)}).`,
        timestamp: ctx.now,
      }),
    };
  }
}

/**
 * Whether every required signal of a matcher reached a verdict in the run —
 * either it fired, or its evaluator measurably found nothing.
 */
function isDecidable(matcher: PatternMatcher, signals: SignalIndex): boolean {
  return matcher.requiredSignals.every(
    (type) => signals.has(type) || signals.absence(type).informative,
  );
}

/**
 * Correlate a signal run into diagnoses, with full explainability.
 * Never throws.
 *
 * `matchers` defaults to the full registry; it is a parameter so tests can
 * exercise the failure-isolation path with a deliberately broken matcher.
 */
export function evaluateDiagnoses(
  input: DiagnosisEngineInput,
  matchers: readonly PatternMatcher[] = MATCHERS,
): DiagnosisEvaluationResult {
  const config = resolveDiagnosisConfig(input.config);
  const now = input.now;

  if (!isIsoDate(input.current.date)) {
    return rejection(
      DiagnosisEngineErrorCode.INVALID_DATE,
      `Diagnosis Engine received an unparseable run date "${input.current.date}". Dates must be calendar dates in "YYYY-MM-DD" form.`,
      { date: input.current.date },
      now,
    );
  }

  const historyRuns = [
    ...(input.history ?? []).map((run) => ({ date: run.date, run })),
    ...(input.historyMetricsOnly ?? []).map((day) => ({
      date: day.date,
      run: { signals: [], metrics: day.metrics },
    })),
  ];
  for (const { date } of historyRuns) {
    if (isIsoDate(date)) continue;
    return rejection(
      DiagnosisEngineErrorCode.INVALID_DATE,
      `Diagnosis Engine received an unparseable history date "${date}". Dates must be calendar dates in "YYYY-MM-DD" form.`,
      { date },
      now,
    );
  }

  // Clinic scope. A history day from another clinic is not a data-quality
  // warning to be absorbed: it would silently fabricate a baseline for this one.
  const foreign = new Set<string>();
  for (const clinic of clinicsIn(input.current)) {
    if (clinic !== input.clinicId) foreign.add(clinic);
  }
  const foreignHistory: string[] = [];
  for (const { date, run } of historyRuns) {
    for (const clinic of clinicsIn({
      signals: run.signals ?? [],
      metrics: run.metrics,
    })) {
      if (clinic === input.clinicId) continue;
      foreign.add(clinic);
      foreignHistory.push(`${date}:${clinic}`);
    }
  }
  if (foreign.size > 0) {
    return rejection(
      DiagnosisEngineErrorCode.MIXED_CLINIC,
      `Diagnosis Engine received data for more than one clinic. Diagnoses are always scoped to a single clinic, and history from another clinic would fabricate a baseline for this one.`,
      {
        clinicId: input.clinicId,
        foreignClinicIds: [...foreign].sort(),
        foreignHistoryDays: foreignHistory.sort(),
      },
      now,
    );
  }

  const builtMetrics = buildMetricIndex(input.current.metrics, input.clinicId);
  if (!builtMetrics.ok) {
    return rejection(
      DiagnosisEngineErrorCode.MIXED_CLINIC,
      builtMetrics.error.message,
      builtMetrics.error.details,
      now,
    );
  }
  const metrics: MetricIndex = builtMetrics.index;
  const signals = buildSignalIndex(input.current.signals, input.current.trace);
  const { window, notes } = prepareHistory(input, config);

  const traces: DecisionTrace[] = [
    trace({
      step: "prepare-input",
      reasoning: `Indexed ${input.current.signals.length} signal(s), ${metrics.size} metric(s), and ${input.current.trace.length} trace entr(ies) for ${input.clinicId} on ${input.current.date}. History: ${window.suppliedDays} day(s) supplied, ${window.derivedDates.length} re-derived from metrics, ${window.gapDates.length} calendar gap(s) treated as unknown.`,
      timestamp: now,
      evidence: notes.map((note, position) =>
        diagnosisEvidence({
          ownerId: `${DIAGNOSIS_ENGINE_NAME}.history`,
          slug: `note.${position}`,
          description: note,
          capturedAt: now,
        }),
      ),
    }),
  ];

  const ctx: MatcherContext = {
    clinicId: input.clinicId,
    date: input.current.date,
    now,
    signals,
    metrics,
    window,
    config,
  };

  const diagnoses: Diagnosis[] = [];
  const claimed = new Set<string>();
  for (const matcher of matchers) {
    const result = runMatcher(matcher, ctx);
    traces.push(result.trace);
    for (const diagnosis of result.diagnoses) {
      diagnoses.push(diagnosis);
      for (const signalId of diagnosis.signalIds) claimed.add(signalId);
    }
  }

  // Unclustered runs last: it needs to know what everything else claimed.
  const unclustered = matchUnclustered(ctx, claimed);
  traces.push(
    trace({
      step: DiagnosisPattern.UNCLUSTERED_SIGNAL,
      reasoning:
        unclustered.kind === "matched"
          ? `Matched: ${unclustered.diagnoses.length} signal(s) belonged to no pattern and were carried forward individually.`
          : `Not matched: ${unclustered.reason}`,
      timestamp: now,
    }),
  );
  if (unclustered.kind === "matched") diagnoses.push(...unclustered.diagnoses);

  const emitted = diagnoses.length > 0;
  const decidable = matchers.filter((matcher) => isDecidable(matcher, signals)).length;
  const decidability =
    matchers.length === 0 ? undefined : round2(decidable / matchers.length);
  const confidence = emitted
    ? round2(
        diagnoses.reduce((sum, diagnosis) => sum + diagnosis.confidence, 0) /
          diagnoses.length,
      )
    : decidability;
  const confidenceBasis: DiagnosisEvaluationResult["confidenceBasis"] = emitted
    ? "emitted_diagnoses"
    : decidability === undefined
      ? "none"
      : "matcher_decidability";

  traces.push(
    trace({
      step: "summarise-run",
      reasoning: emitted
        ? `${diagnoses.length} diagnosis(es) emitted; confidence is their mean data and pattern completeness. ${decidable} of ${matchers.length} matcher(s) had every required signal decided.`
        : `No diagnosis emitted; confidence reports matcher decidability instead — ${decidable} of ${matchers.length} matcher(s) had every required signal decided by the signal run.`,
      timestamp: now,
      confidence,
    }),
  );

  return {
    diagnoses: sortCanonically(diagnoses),
    traces,
    confidence,
    confidenceBasis,
  };
}

/**
 * The pure diagnosis core: a signal run in, diagnoses out.
 * Returns an empty array when the input is rejected; callers that need the typed
 * rejection use {@link evaluateDiagnoses}.
 */
export function diagnose(input: DiagnosisEngineInput): Diagnosis[] {
  return [...evaluateDiagnoses(input).diagnoses];
}
