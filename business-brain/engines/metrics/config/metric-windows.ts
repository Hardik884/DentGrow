/**
 * Metrics Engine — window definitions
 *
 * Trailing-window lengths for the rate and average metrics. These are part of a
 * metric's DEFINITION, not a threshold: `revenue.production_30d` means something
 * different if the window changes, so the number belongs in the metric's name
 * and cannot be silently retuned the way a signal threshold can.
 *
 * Why 30 days: dentistry is lumpy. A single implant case can outweigh a month of
 * cleanings, so daily figures are n=1 noise. Thirty days is the shortest window
 * that smooths case mix while still reacting inside a month.
 *
 * Why 180 days for reactivation: the standard recall interval is six months, so a
 * patient who has not attended in that long has missed at least one recall. This
 * is the one value that is genuinely clinic-specific — a paediatric or
 * orthodontic practice recalls on a different cycle — and is the first candidate
 * if the Metrics Engine gains per-clinic configuration.
 */
export const METRIC_WINDOWS = {
  /** Trailing days for production, collection rate, and average case value. */
  TRAILING_DAYS: 30,
  /** Days since last visit before a patient counts as needing reactivation. */
  REACTIVATION_DAYS: 180,
  /**
   * Days of forward schedule to assess. Seven is the horizon a clinic can still
   * act on: enough time to call a recall list and fill gaps, short enough that
   * the bookings are real rather than aspirational.
   */
  FORWARD_DAYS: 7,
} as const;
