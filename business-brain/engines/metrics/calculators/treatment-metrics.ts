/**
 * Metrics Engine — Treatment calculators
 */

import type { Metric } from "../../../domain";
import type { ClinicDataSnapshot } from "../../../repositories";
import { METRIC_WINDOWS } from "../config/metric-windows";
import { completedInWindow, datePart, windowStart } from "../support/windows";
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

/**
 * Case acceptance rate over the trailing window — the share of recommended
 * treatment VALUE the patient agreed to.
 *
 * The single most important KPI in dental practice management. A clinic can be
 * busy, well-utilised and still failing, because the work it recommends is not
 * being accepted; no other metric here reveals that. It also separates a
 * marketing problem (too few patients) from a communication problem (enough
 * patients, too few saying yes), which call for opposite responses.
 *
 * Measured by value rather than count, because that is the figure that moves
 * the business: declining one implant matters more than declining three
 * cleanings.
 *
 * Basis is treatments PRESENTED in the window — dated by `createdAt`, when the
 * plan was recorded — which is a different set from those performed in it.
 *
 * `cancelled` is NOT counted as a decline. A plan the clinic called off, or a
 * duplicate entry, says nothing about the patient's answer, and conflating the
 * two would make the metric unusable.
 *
 * WITHHELD when nothing was presented in the window: a rate against no
 * recommendations is undefined.
 *
 * CAVEAT: this reads 100% until the clinic actually records declines. A clinic
 * that never enters a refused plan has no declined rows, which is
 * indistinguishable from perfect acceptance. Treat a flat 100% as "not being
 * captured yet", not as a result.
 */
export function caseAcceptanceRate30d(s: ClinicDataSnapshot): Metric | null {
  const from = windowStart(s.date, METRIC_WINDOWS.TRAILING_DAYS);
  const presented = s.treatments.filter(
    (t) => datePart(t.createdAt) >= from && datePart(t.createdAt) <= s.date,
  );

  const presentedValue = presented.reduce((sum, t) => sum + t.cost, 0);
  if (presentedValue <= 0) {
    return null;
  }
  const declinedValue = presented
    .filter((t) => t.status === "declined")
    .reduce((sum, t) => sum + t.cost, 0);

  const value = Math.round(((presentedValue - declinedValue) / presentedValue) * 1000) / 10;
  return buildMetric(
    MetricKey.TREATMENT_CASE_ACCEPTANCE_RATE_30D,
    value,
    s.clinicId,
    s.date,
    s.asOf,
  );
}
