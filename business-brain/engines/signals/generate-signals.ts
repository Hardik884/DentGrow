/**
 * Business Brain — Signal Engine: pure core
 *
 * Reads Metric objects, returns Signal objects. Nothing else: no database, no
 * repositories, no clock, no randomness, no network, no LLM, and no new
 * metrics. The boundary is enforced by the `no-restricted-imports` rule scoped
 * to this directory in `eslint.config.mjs`, not by this comment.
 *
 * Determinism is a hard requirement. `now` is injected, ids are stable slugs,
 * derived values are rounded to a fixed precision, and output order is a
 * canonical sort — identical input always produces byte-identical output.
 *
 * Note on ordering: the sort is for reproducibility, NOT ranking. Signals are
 * ordered by category then id, never by severity or priority. Ranking is a
 * later phase's job.
 *
 * PUBLIC SURFACE — both exports below are public and stable, and downstream
 * phases may depend on either:
 *
 * - {@link evaluateSignals} is the FULL pure core: signals, traces, run
 *   confidence, and typed rejection. Callers that need to know why an evaluator
 *   stayed silent (the Diagnosis Engine does) use this one.
 * - {@link generateSignals} is the thin convenience wrapper over it, returning
 *   just `Signal[]`. It is the name the phase brief specified and is kept.
 *
 * Neither name will be changed without a migration.
 */

import { SignalCategory, type Metric, type Signal } from "../../domain";
import type { Confidence, DecisionTrace, EngineError, Evidence } from "../../types";
import {
  resolveConfig,
  type DeepPartial,
  type SignalThresholdConfig,
} from "./config/signal-thresholds";
import { EVALUATORS } from "./evaluators/registry";
import type { EvaluatorContext, SignalEvaluator } from "./evaluators/types";
import { meanConfidence } from "./support/confidence";
import { buildEvidence } from "./support/evidence";
import { buildMetricIndex, type MetricIndex } from "./support/metric-index";
import { round2 } from "./support/numbers";

/** Engine name used in traces and evidence. */
export const SIGNAL_ENGINE_NAME = "SignalEngine";

/** Input to the pure signal core. */
export interface SignalEngineInput {
  /** Current-period metrics. */
  readonly metrics: readonly Metric[];
  /** Optional prior-period metrics, supplied by the caller. Never fetched. */
  readonly previousMetrics?: readonly Metric[];
  readonly clinicId: string;
  /** Business date, "YYYY-MM-DD". */
  readonly date: string;
  /** Injected ISO-8601 timestamp. The engine never reads the system clock. */
  readonly now: string;
  /** Threshold overrides, deep-merged onto the defaults. */
  readonly config?: DeepPartial<SignalThresholdConfig>;
}

/** Full result of a signal run, including explainability and validation. */
export interface SignalEvaluationResult {
  readonly signals: readonly Signal[];
  readonly traces: readonly DecisionTrace[];
  /**
   * Mean confidence of the emitted signals.
   *
   * When nothing was emitted there is no mean to report, so this is the run's
   * INPUT COVERAGE instead: the fraction of evaluators whose required metrics
   * were present, i.e. that reached a verdict rather than skipping. A quiet run
   * over complete data reports 1; a quiet run where every evaluator skipped for
   * missing data reports 0. Reporting 1 for the latter would claim confidence in
   * an answer the engine never computed.
   *
   * Undefined when the input was rejected or no evaluators were registered.
   */
  readonly confidence?: Confidence;
  /** How the reported confidence was derived. */
  readonly confidenceBasis: "emitted_signals" | "input_coverage" | "none";
  /** Present only when the input was rejected. */
  readonly error?: EngineError;
}

/** Canonical category order for the output sort. */
const CATEGORY_ORDER: readonly string[] = [
  SignalCategory.FINANCIAL,
  SignalCategory.SCHEDULING,
  SignalCategory.CLINICAL,
  SignalCategory.RETENTION,
  SignalCategory.OPERATIONAL,
];

function categoryRank(signal: Signal): number {
  const index = signal.category ? CATEGORY_ORDER.indexOf(signal.category) : -1;
  return index === -1 ? CATEGORY_ORDER.length : index;
}

/** Stable sort by category then id. Locale-independent string comparison. */
function sortCanonically(signals: readonly Signal[]): Signal[] {
  return [...signals].sort((a, b) => {
    const byCategory = categoryRank(a) - categoryRank(b);
    if (byCategory !== 0) return byCategory;
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
    engine: SIGNAL_ENGINE_NAME,
    step: params.step,
    reasoning: params.reasoning,
    evidence: params.evidence ?? [],
    confidence: params.confidence,
    timestamp: params.timestamp,
  };
}

function indexTrace(
  index: MetricIndex,
  previous: MetricIndex | undefined,
  now: string,
): DecisionTrace {
  const warnings = [...index.warnings, ...(previous?.warnings ?? [])];
  const evidence = warnings.map((warning, i) =>
    buildEvidence({
      signalId: `${SIGNAL_ENGINE_NAME}.index`,
      slug: `${warning.code.toLowerCase()}.${i}`,
      description: warning.message,
      capturedAt: now,
      data: { code: warning.code },
    }),
  );
  const previousNote = previous
    ? `${previous.size} prior-period metric(s)`
    : "no prior-period metrics";
  return trace({
    step: "index-metrics",
    reasoning: `Indexed ${index.size} metric(s) by key and ${previousNote}. ${warnings.length} indexing warning(s).`,
    timestamp: now,
    evidence,
  });
}

function runEvaluator(
  evaluator: SignalEvaluator,
  ctx: EvaluatorContext,
): {
  readonly signal?: Signal;
  readonly trace: DecisionTrace;
  /** Whether the evaluator reached a verdict (its required metrics were present). */
  readonly evaluated: boolean;
} {
  try {
    const outcome = evaluator.evaluate(ctx);
    if (outcome.kind === "signal") {
      return {
        signal: outcome.signal,
        evaluated: true,
        trace: trace({
          step: evaluator.type,
          reasoning: `Signal raised: ${outcome.signal.description}`,
          timestamp: ctx.now,
          evidence: outcome.signal.evidence,
          confidence: outcome.signal.confidence,
        }),
      };
    }
    if (outcome.kind === "no_signal") {
      return {
        evaluated: true,
        trace: trace({
          step: evaluator.type,
          reasoning: `No signal: ${outcome.reason}`,
          timestamp: ctx.now,
        }),
      };
    }
    return {
      evaluated: false,
      trace: trace({
        step: evaluator.type,
        reasoning: `Skipped: ${outcome.reason}`,
        timestamp: ctx.now,
      }),
    };
  } catch (error) {
    // One broken evaluator must never fail the run.
    return {
      evaluated: false,
      trace: trace({
        step: evaluator.type,
        reasoning: `Skipped: evaluator threw (${error instanceof Error ? error.message : String(error)}).`,
        timestamp: ctx.now,
      }),
    };
  }
}

/**
 * Run every registered evaluator and return signals plus full explainability.
 * Never throws.
 *
 * `evaluators` defaults to the full registry; it is a parameter so tests can
 * exercise the failure-isolation path with a deliberately broken evaluator.
 */
export function evaluateSignals(
  input: SignalEngineInput,
  evaluators: readonly SignalEvaluator[] = EVALUATORS,
): SignalEvaluationResult {
  const config = resolveConfig(input.config);

  const current = buildMetricIndex(input.metrics, input.clinicId);
  if (!current.ok) {
    return {
      signals: [],
      traces: [
        trace({
          step: "validate-input",
          reasoning: current.error.message,
          timestamp: input.now,
        }),
      ],
      confidenceBasis: "none",
      error: current.error,
    };
  }

  let previousIndex: MetricIndex | undefined;
  if (input.previousMetrics) {
    const previous = buildMetricIndex(input.previousMetrics, input.clinicId);
    if (!previous.ok) {
      return {
        signals: [],
        traces: [
          trace({
            step: "validate-input",
            reasoning: `Prior-period metrics rejected: ${previous.error.message}`,
            timestamp: input.now,
          }),
        ],
        confidenceBasis: "none",
        error: previous.error,
      };
    }
    previousIndex = previous.index;
  }

  const ctx: EvaluatorContext = {
    clinicId: input.clinicId,
    date: input.date,
    now: input.now,
    metrics: current.index,
    previous: previousIndex,
    config,
  };

  const traces: DecisionTrace[] = [indexTrace(current.index, previousIndex, input.now)];
  const signals: Signal[] = [];
  let evaluated = 0;

  for (const evaluator of evaluators) {
    const result = runEvaluator(evaluator, ctx);
    traces.push(result.trace);
    if (result.evaluated) evaluated += 1;
    if (result.signal) signals.push(result.signal);
  }

  const emitted = signals.length > 0;
  const coverage =
    evaluators.length === 0 ? undefined : round2(evaluated / evaluators.length);
  const confidence = emitted
    ? meanConfidence(signals.map((signal) => signal.confidence))
    : coverage;
  const confidenceBasis: SignalEvaluationResult["confidenceBasis"] = emitted
    ? "emitted_signals"
    : coverage === undefined
      ? "none"
      : "input_coverage";

  traces.push(
    trace({
      step: "summarise-run",
      reasoning: emitted
        ? `${signals.length} signal(s) emitted; confidence is their mean data completeness. ${evaluated} of ${evaluators.length} evaluator(s) had their required metrics.`
        : `No signals emitted; confidence reports input coverage instead — ${evaluated} of ${evaluators.length} evaluator(s) had their required metrics and reached a verdict.`,
      timestamp: input.now,
      confidence,
    }),
  );

  return {
    signals: sortCanonically(signals),
    traces,
    confidence,
    confidenceBasis,
  };
}

/**
 * The pure signal core: metrics in, signals out.
 * Returns an empty array when the input is rejected; callers that need the
 * typed rejection use {@link evaluateSignals}.
 */
export function generateSignals(input: SignalEngineInput): Signal[] {
  return [...evaluateSignals(input).signals];
}
