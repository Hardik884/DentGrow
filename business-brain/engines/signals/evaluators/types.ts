/**
 * Business Brain — Signal Engine: evaluator contract
 *
 * One evaluator per signal. Evaluators are pure functions over already-computed
 * metrics: no I/O, no clock, no config imports (config arrives in the context so
 * tests can override it), no shared mutable state.
 */

import type { Signal, SignalCategory, SignalType } from "../../../domain";
import type { MetricKey } from "../../metrics/metric-ids";
import type { SignalThresholdConfig } from "../config/signal-thresholds";
import type { MetricIndex } from "../support/metric-index";

/** Everything an evaluator is allowed to see. */
export interface EvaluatorContext {
  readonly clinicId: string;
  /** Business date being evaluated, "YYYY-MM-DD". */
  readonly date: string;
  /** Injected ISO-8601 timestamp. Evaluators never read the system clock. */
  readonly now: string;
  /** Current-period metrics, addressable by key. */
  readonly metrics: MetricIndex;
  /** Prior-period metrics, when the caller supplied them. */
  readonly previous?: MetricIndex;
  /** Fully resolved thresholds. */
  readonly config: SignalThresholdConfig;
}

/**
 * The three possible results of an evaluation.
 *
 * `no_signal` means "evaluated, nothing to report" (including a signal
 * suppressed for low confidence). `skipped` means "could not evaluate".
 */
export type EvaluatorOutcome =
  | { readonly kind: "signal"; readonly signal: Signal }
  | { readonly kind: "no_signal"; readonly reason: string }
  | {
      readonly kind: "skipped";
      readonly reason: string;
      readonly missing?: readonly MetricKey[];
    };

/** A single, self-contained signal rule. */
export interface SignalEvaluator {
  /** Stable machine identifier of the signal this evaluator can raise. */
  readonly type: SignalType;
  /** Category the emitted signal belongs to. */
  readonly category: SignalCategory;
  /** Without all of these, the evaluator skips — it never assumes zero. */
  readonly requiredMetrics: readonly MetricKey[];
  /** Absent optional metrics reduce confidence rather than skipping. */
  readonly optionalMetrics?: readonly MetricKey[];
  /** Whether the evaluator needs `ctx.previous`. */
  readonly requiresPreviousPeriod?: boolean;
  evaluate(ctx: EvaluatorContext): EvaluatorOutcome;
}

/** Standard skip outcome for absent required metrics. */
export function skippedForMissing(missing: readonly MetricKey[]): EvaluatorOutcome {
  return {
    kind: "skipped",
    reason: `Required metrics unavailable: ${missing.join(", ")}.`,
    missing,
  };
}

/** Standard skip outcome when no prior-period metrics were supplied. */
export function skippedForNoPreviousPeriod(): EvaluatorOutcome {
  return {
    kind: "skipped",
    reason: "No prior-period metrics were supplied for comparison.",
  };
}
