/**
 * Metrics Engine — Patient calculators
 */

import type { Metric } from "../../../domain";
import type { ClinicDataSnapshot } from "../../../repositories";
import { MetricKey, buildMetric } from "../metric-ids";

/** Returns the "YYYY-MM-DD" calendar date portion of an ISO timestamp. */
function toDatePart(iso: string): string {
  return iso.slice(0, 10);
}

/** New patients today — records created on the target date. */
export function newPatientsToday(s: ClinicDataSnapshot): Metric {
  return buildMetric(
    MetricKey.PATIENTS_NEW_TODAY,
    s.patientsRegisteredToday.length,
    s.clinicId,
    s.date,
    s.asOf,
  );
}

/**
 * Returning patients today — distinct patients seen today whose record was
 * created before today. Patients registered today are treated as new, not
 * returning.
 */
export function returningPatientsToday(s: ClinicDataSnapshot): Metric {
  const seen = new Set<string>();
  for (const p of s.patientsSeenToday) {
    if (toDatePart(p.createdAt) < s.date) {
      seen.add(p.id);
    }
  }
  return buildMetric(MetricKey.PATIENTS_RETURNING_TODAY, seen.size, s.clinicId, s.date, s.asOf);
}
