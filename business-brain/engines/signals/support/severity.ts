/**
 * Business Brain — Signal Engine: severity
 *
 * Severity is never a per-evaluator judgement call. It is a single function of
 * how far a measurement broke its configured threshold, expressed as a
 * normalised "breach magnitude", then clamped by optional per-signal overrides.
 *
 * Priority is a fixed projection of severity, not a separate opinion.
 */

import { Priority, Severity } from "../../../types";
import type { SignalType } from "../../../domain";
import type { SeverityBands, SignalThresholdConfig } from "../config/signal-thresholds";
import { round2 } from "./numbers";

/** Which side of the threshold counts as worse. */
export const ThresholdDirection = {
  /** Higher values are worse (e.g. cancellation rate). */
  UPPER: "upper",
  /** Lower values are worse (e.g. revenue collected). */
  LOWER: "lower",
} as const;

export type ThresholdDirection =
  (typeof ThresholdDirection)[keyof typeof ThresholdDirection];

/** Ascending severity order, used for floor/ceiling clamping. */
export const SEVERITY_ORDER: readonly Severity[] = [
  Severity.INFO,
  Severity.LOW,
  Severity.MEDIUM,
  Severity.HIGH,
  Severity.CRITICAL,
];

/** Fixed severity -> priority table. Never chosen ad hoc. */
const PRIORITY_BY_SEVERITY: Readonly<Record<Severity, Priority>> = {
  [Severity.CRITICAL]: Priority.CRITICAL,
  [Severity.HIGH]: Priority.HIGH,
  [Severity.MEDIUM]: Priority.MEDIUM,
  [Severity.LOW]: Priority.LOW,
  [Severity.INFO]: Priority.LOW,
};

/** Project a severity onto its priority. */
export function priorityFor(severity: Severity): Priority {
  return PRIORITY_BY_SEVERITY[severity];
}

/** How the breach magnitude was derived. */
export const BreachScale = {
  /** Relative to the threshold: `delta / threshold`. */
  RELATIVE: "relative",
  /** Absolute delta, used when the threshold is zero. */
  ABSOLUTE: "absolute",
} as const;

export type BreachScale = (typeof BreachScale)[keyof typeof BreachScale];

export interface BreachAssessment {
  /** Normalised, 2dp-rounded magnitude of the breach. */
  readonly breach: number;
  /** Severity after band mapping and override clamping. */
  readonly severity: Severity;
  /** Priority derived from the final severity. */
  readonly priority: Priority;
  /** Severity before override clamping, for auditability. */
  readonly bandSeverity: Severity;
  /** Which formula produced the breach. */
  readonly scale: BreachScale;
}

export interface BreachInput {
  readonly value: number;
  readonly threshold: number;
  readonly direction: ThresholdDirection;
  readonly type: SignalType;
  readonly config: SignalThresholdConfig;
}

/**
 * Normalised distance past the threshold.
 * A zero threshold falls back to the absolute delta so we never divide by zero.
 */
function breachMagnitude(
  value: number,
  threshold: number,
  direction: ThresholdDirection,
): { readonly breach: number; readonly scale: BreachScale } {
  const delta =
    direction === ThresholdDirection.UPPER ? value - threshold : threshold - value;
  if (threshold === 0) {
    return { breach: round2(Math.abs(delta)), scale: BreachScale.ABSOLUTE };
  }
  return {
    breach: round2(delta / Math.abs(threshold)),
    scale: BreachScale.RELATIVE,
  };
}

/** Map a breach magnitude onto a severity band. */
export function severityFromBreach(breach: number, bands: SeverityBands): Severity {
  if (breach >= bands.critical) return Severity.CRITICAL;
  if (breach >= bands.high) return Severity.HIGH;
  if (breach >= bands.medium) return Severity.MEDIUM;
  if (breach >= bands.low) return Severity.LOW;
  return Severity.INFO;
}

/** Apply the configured floor/ceiling for a signal type. */
export function applySeverityOverride(
  severity: Severity,
  type: SignalType,
  config: SignalThresholdConfig,
): Severity {
  const override = config.severity.overrides?.[type];
  if (!override) return severity;
  let index = SEVERITY_ORDER.indexOf(severity);
  if (override.floor) index = Math.max(index, SEVERITY_ORDER.indexOf(override.floor));
  if (override.ceiling) index = Math.min(index, SEVERITY_ORDER.indexOf(override.ceiling));
  return SEVERITY_ORDER[index];
}

/** The single entry point evaluators use to grade a breach. */
export function assessBreach(input: BreachInput): BreachAssessment {
  const { breach, scale } = breachMagnitude(
    input.value,
    input.threshold,
    input.direction,
  );
  const bandSeverity = severityFromBreach(breach, input.config.severity.bands);
  const severity = applySeverityOverride(bandSeverity, input.type, input.config);
  return {
    breach,
    severity,
    priority: priorityFor(severity),
    bandSeverity,
    scale,
  };
}

/** Pick the worse of two assessments, for signals with two trigger branches. */
export function worstOf(a: BreachAssessment, b: BreachAssessment): BreachAssessment {
  return b.breach > a.breach ? b : a;
}
