/**
 * Business Brain — Signal Engine: numeric helpers
 *
 * Small deterministic helpers. Every derived number the engine compares or
 * reports goes through {@link round2} first so float drift can never flip a
 * threshold or change output bytes between runs.
 */

/** Fixed precision used for every derived value in this engine. */
export const PRECISION = 2;

/** Round to 2 decimal places, normalising -0 to 0. */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** PRECISION;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

/** Clamp a value into an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Whether a number is usable as a metric value. */
export function isUsableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * `part / whole` as a percentage, rounded to 2dp. Returns null when the
 * denominator is zero or negative, so callers must handle the undefined case
 * explicitly instead of receiving NaN or Infinity.
 */
export function percentageOf(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return round2((part / whole) * 100);
}

/** Result of comparing a current value against a prior-period value. */
export type GrowthComparison =
  | { readonly kind: "percent"; readonly percent: number; readonly delta: number }
  | { readonly kind: "no_baseline"; readonly delta: number };

/**
 * Percentage change from `previous` to `current`, rounded to 2dp.
 * A zero (or negative) baseline yields `no_baseline` so callers fall back to an
 * absolute rule instead of dividing by zero.
 */
export function growth(current: number, previous: number): GrowthComparison {
  const delta = round2(current - previous);
  if (previous <= 0) return { kind: "no_baseline", delta };
  return { kind: "percent", percent: round2((delta / previous) * 100), delta };
}
