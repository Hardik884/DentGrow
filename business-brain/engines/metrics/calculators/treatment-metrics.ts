/**
 * Metrics Engine — Treatment calculators
 */

import type { Metric } from "../../../domain";
import type { ClinicDataSnapshot } from "../../../repositories";
import { METRIC_WINDOWS } from "../config/metric-windows";
import { completedInWindow } from "../support/windows";
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

/**
 * Average value of a case completed in the trailing window.
 *
 * Separates a volume problem from a value problem. Revenue can fall with patient
 * numbers flat because the case mix shifted towards cleanings — a completely
 * different response from "we need more patients". This is the metric the
 * `revenue_shortfall` diagnosis needs to settle its `case_mix` hypothesis, which
 * is otherwise always undetermined.
 *
 * Gross cost, matching {@link production30d}, so the two divide cleanly into a
 * case count.
 *
 * WITHHELD when nothing completed in the window: a mean of no cases is
 * undefined, and reporting 0 would read as "our cases are worthless".
 */
export function averageCaseValue30d(s: ClinicDataSnapshot): Metric | null {
  const completed = completedInWindow(s, METRIC_WINDOWS.TRAILING_DAYS);
  if (completed.length === 0) {
    return null;
  }
  const total = completed.reduce((sum, t) => sum + t.cost, 0);
  const value = Math.round((total / completed.length) * 100) / 100;
  return buildMetric(
    MetricKey.TREATMENT_AVERAGE_CASE_VALUE_30D,
    value,
    s.clinicId,
    s.date,
    s.asOf,
  );
}

