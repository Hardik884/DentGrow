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
 * Outstanding payments — total treatment charges billed minus total payments
 * collected, floored at zero. Cancelled treatments are not billed.
 */
export function outstandingPayments(s: ClinicDataSnapshot): Metric {
  const billed = s.treatments
    .filter((t) => t.status !== "cancelled")
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
