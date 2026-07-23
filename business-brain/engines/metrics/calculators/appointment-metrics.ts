/**
 * Metrics Engine — Appointment calculators
 *
 * Each function computes a single appointment metric from the snapshot. Pure
 * and deterministic: same snapshot in, same Metric out.
 */

import type { Metric } from "../../../domain";
import type { ClinicDataSnapshot } from "../../../repositories";
import { MetricKey, buildMetric } from "../metric-ids";

/** Total appointments scheduled today. */
export function totalAppointmentsToday(s: ClinicDataSnapshot): Metric {
  return buildMetric(
    MetricKey.APPOINTMENTS_TOTAL_TODAY,
    s.appointmentsToday.length,
    s.clinicId,
    s.date,
    s.asOf,
  );
}

/** Appointments today with status `completed`. */
export function completedAppointmentsToday(s: ClinicDataSnapshot): Metric {
  const value = s.appointmentsToday.filter((a) => a.status === "completed").length;
  return buildMetric(MetricKey.APPOINTMENTS_COMPLETED_TODAY, value, s.clinicId, s.date, s.asOf);
}

/**
 * Upcoming appointments today — still to be seen. Counts appointments that are
 * `scheduled` or `checked_in` (not yet started, completed, cancelled, or missed).
 */
export function upcomingAppointmentsToday(s: ClinicDataSnapshot): Metric {
  const value = s.appointmentsToday.filter(
    (a) => a.status === "scheduled" || a.status === "checked_in",
  ).length;
  return buildMetric(MetricKey.APPOINTMENTS_UPCOMING_TODAY, value, s.clinicId, s.date, s.asOf);
}

/** Appointments today with status `cancelled`. */
export function cancelledAppointmentsToday(s: ClinicDataSnapshot): Metric {
  const value = s.appointmentsToday.filter((a) => a.status === "cancelled").length;
  return buildMetric(MetricKey.APPOINTMENTS_CANCELLED_TODAY, value, s.clinicId, s.date, s.asOf);
}

/** Appointments today with status `no_show`. */
export function noShowsToday(s: ClinicDataSnapshot): Metric {
  const value = s.appointmentsToday.filter((a) => a.status === "no_show").length;
  return buildMetric(MetricKey.APPOINTMENTS_NO_SHOWS_TODAY, value, s.clinicId, s.date, s.asOf);
}
