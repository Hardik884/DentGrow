/**
 * Metrics Engine — Capacity calculators
 *
 * Slot-based capacity. "Booked" slots are today's appointments that still
 * occupy a slot (everything except cancelled and no_show).
 */

import type { Metric } from "../../../domain";
import type { ClinicDataSnapshot } from "../../../repositories";
import { MetricKey, buildMetric } from "../metric-ids";
import { fillRate, occupiesSlot } from "../support/windows";

/** Count of today's appointments that occupy a slot (exclude cancelled / no_show). */
function bookedSlots(s: ClinicDataSnapshot): number {
  return s.appointmentsToday.filter((a) => occupiesSlot(a.status)).length;
}

/**
 * Chair utilization (%) — booked slots as a share of total slots offered today.
 * Guards against divide-by-zero (returns 0 when the clinic offers no slots).
 * Capped at 100% in case of overbooking.
 */
export function chairUtilization(s: ClinicDataSnapshot): Metric {
  const total = s.capacity.totalSlotsToday;
  const booked = bookedSlots(s);
  const raw = total <= 0 ? 0 : (booked / total) * 100;
  const value = Math.round(Math.min(100, raw) * 10) / 10;
  return buildMetric(MetricKey.CAPACITY_CHAIR_UTILIZATION, value, s.clinicId, s.date, s.asOf);
}

/**
 * Available appointment slots today — total slots minus booked slots, floored
 * at zero.
 */
export function availableSlotsToday(s: ClinicDataSnapshot): Metric {
  const value = Math.max(0, s.capacity.totalSlotsToday - bookedSlots(s));
  return buildMetric(MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY, value, s.clinicId, s.date, s.asOf);
}

/**
 * Chair utilization averaged across the trailing window.
 *
 * Daily utilization swings wildly — a single cancellation moves it double
 * digits — so the daily figure is a poor basis for any decision. The 30-day
 * number is what tells an owner whether to hire, extend hours, or market.
 *
 * WITHHELD when the window is absent, or when the clinic offered no capacity at
 * all across it (a rate against zero slots is undefined).
 */
export function chairUtilization30d(s: ClinicDataSnapshot): Metric | null {
  const window = s.trailingWindow;
  if (window === undefined) return null;
  const value = fillRate(window);
  if (value === null) return null;
  return buildMetric(
    MetricKey.CAPACITY_CHAIR_UTILIZATION_30D,
    value,
    s.clinicId,
    s.date,
    s.asOf,
  );
}

/**
 * How full the schedule is for the days AHEAD — future schedule health.
 *
 * The only forward-looking metric the engine produces, and the only one that can
 * warn rather than diagnose. Every other metric reports what already happened,
 * by which time the week is lost; a thin week ahead can still be filled from the
 * recall list.
 *
 * WITHHELD when the forward window is absent, or when the clinic offers no
 * capacity in it — a clinic closed for the week is not 0% booked, it is not
 * open, and those must not read the same.
 */
export function bookedNext7d(s: ClinicDataSnapshot): Metric | null {
  const window = s.forwardWindow;
  if (window === undefined) return null;
  const value = fillRate(window);
  if (value === null) return null;
  return buildMetric(MetricKey.CAPACITY_BOOKED_NEXT_7D, value, s.clinicId, s.date, s.asOf);
}
