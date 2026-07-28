/**
 * Diagnosis Engine — date helpers (re-export).
 *
 * The implementation moved to `business-brain/utils/dates.ts` when the Metrics
 * Engine needed the same calendar arithmetic for its trailing windows. Calendar
 * maths is a shared primitive, not a diagnosis concern, and duplicating it would
 * risk the two engines disagreeing about what a date is.
 *
 * This module is kept so existing imports inside the Diagnosis Engine, and its
 * public barrel, continue to resolve unchanged.
 */
export * from "../../../utils/dates";
