/**
 * Metrics Engine — Treatment calculators
 */

import type { Metric } from "../../../domain";
import type { ClinicDataSnapshot } from "../../../repositories";
import { MetricKey, buildMetric } from "../metric-ids";

/** Returns the "YYYY-MM-DD" calendar date portion of an ISO timestamp. */
function toDatePart(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Accepted treatments pending scheduling — `planned` treatments that do not yet
 * have a scheduled appointment/follow-up.
 */
export function acceptedTreatmentsPendingScheduling(s: ClinicDataSnapshot): Metric {
  const value = s.treatments.filter((t) => t.status === "planned" && !t.isScheduled).length;
  return buildMetric(
    MetricKey.TREATMENT_ACCEPTED_PENDING_SCHEDULING,
    value,
    s.clinicId,
    s.date,
    s.asOf,
  );
}

/** Treatments completed today — `completed` treatments performed on the target date. */
export function treatmentsCompletedToday(s: ClinicDataSnapshot): Metric {
  const value = s.treatments.filter(
    (t) => t.status === "completed" && t.performedAt !== null && toDatePart(t.performedAt) === s.date,
  ).length;
  return buildMetric(MetricKey.TREATMENT_COMPLETED_TODAY, value, s.clinicId, s.date, s.asOf);
}
