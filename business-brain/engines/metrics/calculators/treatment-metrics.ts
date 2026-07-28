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
 * Accepted treatments pending scheduling — treatments the patient has accepted
 * (`planned`) that are not booked to be performed at any future appointment.
 *
 * Returns `null` — the metric is withheld — when any planned treatment's
 * booking state is unknown (`isScheduled === null`). Counting an unknown as
 * "not scheduled" would report accepted work as unbooked on no evidence, and
 * `clinical.accepted_treatments_unscheduled` would fire on it. Withholding the
 * metric instead makes the downstream evaluator skip and record that it could
 * not measure, which is the honest outcome.
 *
 * With no planned treatments at all the answer is 0 regardless of what is
 * knowable, so the metric is still produced.
 */
export function acceptedTreatmentsPendingScheduling(s: ClinicDataSnapshot): Metric | null {
  const planned = s.treatments.filter((t) => t.status === "planned");
  if (planned.some((t) => t.isScheduled === null)) {
    return null;
  }
  const value = planned.filter((t) => t.isScheduled === false).length;
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
