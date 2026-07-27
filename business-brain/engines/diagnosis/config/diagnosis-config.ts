/**
 * Business Brain — Diagnosis Engine: configuration
 *
 * Every number the Diagnosis Engine compares against lives here. Matchers are
 * forbidden from containing literals: they receive the resolved config through
 * their `MatcherContext` so tests can override any value.
 *
 * The Signal Engine's thresholds are embedded rather than duplicated. The
 * discrimination rules in §8 ask questions like "were appointments at or above
 * their threshold?" — that must be the SAME number the signal evaluator used,
 * or the engine could contradict its own inputs. Re-deriving historical signals
 * from historical metrics uses the same block.
 */

import type { DiagnosisPattern } from "../../../domain";
import {
  DEFAULT_SIGNAL_THRESHOLDS,
  mergeOverrides,
  type DeepPartial,
  type SeverityOverride,
  type SignalThresholdConfig,
} from "../../signals/config/signal-thresholds";

export type { DeepPartial };

/** The complete, typed configuration surface of the Diagnosis Engine. */
export interface DiagnosisConfig {
  readonly persistence: {
    /** Below this many supplied history days, nothing is classified. */
    readonly minimumHistoryDays: number;
    /** Consecutive fired days, including today, that count as sustained. */
    readonly sustainedDays: number;
    /**
     * Change in mean breach magnitude that counts as a real trend rather than
     * day-to-day noise. Applied symmetrically to worsening and improving.
     */
    readonly trendTolerance: number;
  };
  readonly confidence: {
    /**
     * Confidence floor contributed by optional-signal completeness. A pattern
     * with none of its optional signals present is still a real pattern, so the
     * factor is blended from this floor to 1 rather than dropping to zero.
     */
    readonly optionalCompletenessFloor: number;
    /** Deducted when no usable history window was supplied. */
    readonly missingHistoryPenalty: number;
    /** Deducted per history day that is unknown rather than known. */
    readonly unknownHistoryDayPenalty: number;
    /**
     * Deducted per required-signal evaluator that SKIPPED for missing data.
     * A `no_signal` verdict costs nothing: that is a real measured absence.
     */
    readonly tracedSkipPenalty: number;
    /** An undetermined hypothesis never reports above this. */
    readonly undeterminedConfidenceCeiling: number;
    /** Confidence never falls below this. */
    readonly floor: number;
    /** Diagnoses below this confidence are suppressed and traced. */
    readonly minimumToEmit: number;
  };
  readonly severity: {
    /** Per-pattern floor/ceiling clamps, applied after persistence adjustment. */
    readonly overrides?: Partial<Record<DiagnosisPattern, SeverityOverride>>;
  };
  readonly discrimination: {
    /**
     * How much one side of a two-sided split must exceed the other before the
     * split is called. 1.5 means "half again as many", which keeps a 6/5 day
     * from being declared cancellation-dominant.
     */
    readonly dominanceRatio: number;
  };
  /** Signal Engine thresholds, reused for discrimination and re-derivation. */
  readonly signals: SignalThresholdConfig;
}

/**
 * Defaults.
 *
 * `minimumHistoryDays: 3` and `sustainedDays: 3` are the same number
 * deliberately: three days is the shortest window in which "again today" can be
 * told apart from "twice in a row by chance", and it is also the shortest window
 * a small practice can be expected to have snapshotted.
 */
export const DEFAULT_DIAGNOSIS_CONFIG: DiagnosisConfig = {
  persistence: {
    minimumHistoryDays: 3,
    sustainedDays: 3,
    trendTolerance: 0.1,
  },
  confidence: {
    optionalCompletenessFloor: 0.7,
    missingHistoryPenalty: 0.1,
    unknownHistoryDayPenalty: 0.05,
    tracedSkipPenalty: 0.1,
    undeterminedConfidenceCeiling: 0.5,
    floor: 0.3,
    minimumToEmit: 0.4,
  },
  severity: {
    overrides: {
      // An isolated signal carried forward so it is not lost between phases is
      // not, by itself, a business emergency.
      unclustered_signal: { ceiling: "high" },
      // Being at capacity while patients wait is a real operational problem,
      // but it is the problem of a clinic that is working, not failing.
      capacity_ceiling: { ceiling: "high" },
    },
  },
  discrimination: {
    dominanceRatio: 1.5,
  },
  signals: DEFAULT_SIGNAL_THRESHOLDS,
};

/**
 * Deep-merge caller overrides onto {@link DEFAULT_DIAGNOSIS_CONFIG}.
 * Pure: the defaults object is never mutated.
 */
export function resolveDiagnosisConfig(
  overrides?: DeepPartial<DiagnosisConfig>,
): DiagnosisConfig {
  return mergeOverrides(DEFAULT_DIAGNOSIS_CONFIG, overrides);
}
