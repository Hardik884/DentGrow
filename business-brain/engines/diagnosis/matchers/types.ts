/**
 * Business Brain — Diagnosis Engine: pattern matcher contract
 *
 * One matcher per pattern. Matchers are pure functions over an already-computed
 * signal run: no I/O, no clock, no config imports (config arrives in the context
 * so tests can override it), no shared mutable state.
 *
 * A matcher answers only "are these observations one story?" and "what causes are
 * consistent with them?". It never ranks, never advises, and never consumes a
 * signal: patterns are overlapping VIEWS of the run, not a partition of it, so
 * one signal legitimately contributes to several diagnoses.
 */

import type { Diagnosis, SignalCategory, SignalType } from "../../../domain";
import type { MetricKey } from "../../metrics/metric-ids";
import type { MetricIndex } from "../../signals/support/metric-index";
import type { DiagnosisConfig } from "../config/diagnosis-config";
import { buildDiagnosis, type DiagnosisDraft } from "../support/diagnosis-builder";
import type { HistoryWindow } from "../support/persistence";
import type { SignalIndex } from "../support/signal-index";

/** Everything a matcher is allowed to see. */
export interface MatcherContext {
  readonly clinicId: string;
  /** Business date being diagnosed, "YYYY-MM-DD". */
  readonly date: string;
  /** Injected ISO-8601 timestamp. Matchers never read the system clock. */
  readonly now: string;
  /** Current-run signals, plus trace-backed classification of absences. */
  readonly signals: SignalIndex;
  /** Current-run metrics, addressable by key, for discrimination arithmetic. */
  readonly metrics: MetricIndex;
  /** Normalised history window for persistence classification. */
  readonly window: HistoryWindow;
  readonly config: DiagnosisConfig;
}

/**
 * The two possible results of matching.
 *
 * `not_matched` always carries a reason: a pattern that did not fire is traced
 * just as fully as one that did, because "we checked and it does not hold" is
 * information the next phase needs.
 */
export type MatcherOutcome =
  | { readonly kind: "matched"; readonly diagnoses: readonly Diagnosis[] }
  | { readonly kind: "not_matched"; readonly reason: string };

/** A single, self-contained correlation rule. */
export interface PatternMatcher {
  readonly pattern: string;
  readonly category: SignalCategory;
  /** Signal types the pattern's matching rule depends on. */
  readonly requiredSignals: readonly SignalType[];
  /** Signal types that strengthen confidence and may add hypotheses. */
  readonly optionalSignals: readonly SignalType[];
  /** Plain-language statement of the matching rule, surfaced in traces. */
  readonly rule: string;
  match(ctx: MatcherContext): MatcherOutcome;
}

/** Standard non-match outcome for a missing required signal. */
export function notMatched(reason: string): MatcherOutcome {
  return { kind: "not_matched", reason };
}

/**
 * Assemble a draft into a diagnosis, or report the confidence suppression as a
 * non-match so the trace records why nothing was emitted.
 */
export function emit(ctx: MatcherContext, draft: DiagnosisDraft): MatcherOutcome {
  const outcome = buildDiagnosis(ctx, draft);
  return outcome.kind === "diagnosis"
    ? { kind: "matched", diagnoses: [outcome.diagnosis] }
    : notMatched(outcome.reason);
}

/** A metric's value, or undefined when it was not supplied for this run. */
export function metricValue(ctx: MatcherContext, key: MetricKey): number | undefined {
  return ctx.metrics.get(key)?.value;
}

/**
 * Describe why a required signal was absent, for the non-match reason.
 * Distinguishes "could not evaluate" from "evaluated, condition did not hold".
 */
export function absenceSummary(
  ctx: MatcherContext,
  types: readonly SignalType[],
): string {
  return types
    .filter((type) => !ctx.signals.has(type))
    .map((type) => {
      const absence = ctx.signals.absence(type);
      return `${type} (${absence.kind})`;
    })
    .join(", ");
}
