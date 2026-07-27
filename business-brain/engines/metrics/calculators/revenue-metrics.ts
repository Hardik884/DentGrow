/**
 * Metrics Engine — Revenue calculators
 *
 * Factual money figures only. No leakage detection, no recommendations.
 */

import type { Metric } from "../../../domain";
import type { ClinicDataSnapshot } from "../../../repositories";
import { MetricKey, buildMetric } from "../metric-ids";

/** Revenue collected today — sum of payments recorded on the target date. */
export function revenueCollectedToday(s: ClinicDataSnapshot): Metric {
  const value = s.payments
    .filter((p) => p.paymentDate === s.date)
    .reduce((sum, p) => sum + p.amount, 0);
  return buildMetric(MetricKey.REVENUE_COLLECTED_TODAY, value, s.clinicId, s.date, s.asOf);
}

/**
 * Treatment statuses that count towards money a patient actually owes.
 *
 * This deliberately mirrors `BILLABLE_TREATMENT_STATUSES` in
 * `lib/billing/balance.ts`, which is the application's single source of truth
 * for outstanding balance. The two are stated separately rather than imported
 * because the Business Brain must not depend on application code — but they
 * describe one business rule and must not diverge. `revenue.spec.ts` asserts
 * this exact set so a change here is always deliberate.
 *
 * `planned` is excluded on purpose: work that has been accepted but not started
 * is not yet owed. That value is reported separately by
 * {@link pendingTreatmentValue}; counting it here would double-count it across
 * two metrics and make `revenue.high_outstanding` fire on unbilled work.
 */
export const BILLABLE_TREATMENT_STATUSES: readonly string[] = ["completed", "in_progress"];

/**
 * Outstanding payments — total billable treatment charges minus total payments
 * collected, floored at zero.
 */
export function outstandingPayments(s: ClinicDataSnapshot): Metric {
  const billed = s.treatments
    .filter((t) => BILLABLE_TREATMENT_STATUSES.includes(t.status))
    .reduce((sum, t) => sum + t.cost, 0);
  const collected = s.payments.reduce((sum, p) => sum + p.amount, 0);
  const value = Math.max(0, billed - collected);
  return buildMetric(MetricKey.REVENUE_OUTSTANDING, value, s.clinicId, s.date, s.asOf);
}

/**
 * Pending treatment value — total cost of treatments that are accepted but not
 * yet completed (`planned` or `in_progress`). Represents booked-but-unrealised
 * clinical revenue.
 */
export function pendingTreatmentValue(s: ClinicDataSnapshot): Metric {
  const value = s.treatments
    .filter((t) => t.status === "planned" || t.status === "in_progress")
    .reduce((sum, t) => sum + t.cost, 0);
  return buildMetric(MetricKey.REVENUE_PENDING_TREATMENT_VALUE, value, s.clinicId, s.date, s.asOf);
}

/**
 * Clinic share of work delivered today — the portion of today's completed
 * treatments the clinic retains after consultant payouts.
 *
 * ACCRUAL, NOT CASH. This measures work delivered on the target date, so its
 * basis is {@link treatmentsCompletedToday}, not
 * {@link revenueCollectedToday} (which is money actually received, whenever the
 * underlying work happened). The two are deliberately not comparable and must
 * never be subtracted from one another.
 *
 * Gross for the same basis is obtained by summing `cost` over the same
 * treatments; the difference is the consultant payout.
 */
export function clinicShareToday(s: ClinicDataSnapshot): Metric {
  const value = s.treatments
    .filter(
      (t) =>
        t.status === "completed" &&
        t.performedAt !== null &&
        t.performedAt.slice(0, 10) === s.date,
    )
    .reduce((sum, t) => sum + t.clinicShare, 0);
  return buildMetric(MetricKey.REVENUE_CLINIC_SHARE_TODAY, value, s.clinicId, s.date, s.asOf);
}
