/**
 * Metrics Engine — Capacity calculators
 *
 * Slot-based capacity. "Booked" slots are today's appointments that still
 * occupy a slot (everything except cancelled and no_show).
 */

import type { Metric } from "../../../domain";
import type { ClinicDataSnapshot } from "../../../repositories";
import { MetricKey, buildMetric } from "../metric-ids";

/** Count of today's appointments that occupy a slot (exclude cancelled / no_show). */
function bookedSlots(s: ClinicDataSnapshot): number {
  return s.appointmentsToday.filter(
    (a) => a.status !== "cancelled" && a.status !== "no_show",
  ).length;
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
