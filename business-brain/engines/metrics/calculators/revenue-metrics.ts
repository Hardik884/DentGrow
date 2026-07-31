/**
 * Metrics Engine — Revenue calculators
 *
 * Factual money figures only. No leakage detection, no recommendations.
 */

import type { Metric } from "../../../domain";
import type { ClinicDataSnapshot } from "../../../repositories";
import { METRIC_WINDOWS } from "../config/metric-windows";
import { completedInWindow, paymentsInWindow } from "../support/windows";
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
 * `planned` is excluded on purpose: work that has been planned but not started
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
 * Pending treatment value — total cost of treatments that are planned but not
 * yet completed (`planned` or `in_progress`). Represents recorded-but-unrealised
 * clinical revenue.
 */
export function pendingTreatmentValue(s: ClinicDataSnapshot): Metric {
  const value = s.treatments
    .filter((t) => t.status === "planned" || t.status === "in_progress")
    .reduce((sum, t) => sum + t.cost, 0);
  return buildMetric(MetricKey.REVENUE_PENDING_TREATMENT_VALUE, value, s.clinicId, s.date, s.asOf);
}


/**
 * Production over the trailing window — the gross value of treatment actually
 * DELIVERED, by the date it was performed.
 *
 * Production and collection are dentistry's fundamental pair, and reporting only
 * one of them hides the most common failure mode: a clinic that is busy and
 * delivering well but not getting paid looks identical to one with no demand.
 * Gross, not clinic share — this measures work done, not what was retained.
 */
export function production30d(s: ClinicDataSnapshot): Metric {
  const value = completedInWindow(s, METRIC_WINDOWS.TRAILING_DAYS).reduce(
    (sum, t) => sum + t.cost,
    0,
  );
  return buildMetric(MetricKey.REVENUE_PRODUCTION_30D, value, s.clinicId, s.date, s.asOf);
}

/**
 * Collection rate over the trailing window — cash received as a percentage of
 * work delivered.
 *
 * Near 100% means the clinic converts delivered work into money. A persistent
 * gap is a collections process problem, not a demand problem, and this is the
 * metric that separates the two.
 *
 * WITHHELD when production is zero: a ratio against nothing is undefined, and
 * reporting 0% would read as "we collected nothing" when the truth is "we
 * delivered nothing". Not capped at 100% — collecting historic dues genuinely
 * can exceed the window's production, and flattening that would hide it.
 */
export function collectionRate30d(s: ClinicDataSnapshot): Metric | null {
  const days = METRIC_WINDOWS.TRAILING_DAYS;
  const produced = completedInWindow(s, days).reduce((sum, t) => sum + t.cost, 0);
  if (produced <= 0) {
    return null;
  }
  const collected = paymentsInWindow(s, days).reduce((sum, p) => sum + p.amount, 0);
  const value = Math.round((collected / produced) * 1000) / 10;
  return buildMetric(MetricKey.REVENUE_COLLECTION_RATE_30D, value, s.clinicId, s.date, s.asOf);
}

/**
 * Cash collected over the trailing window.
 *
 * The numerator inside {@link collectionRate30d}, published separately because
 * a clinic owner reads it directly as "what I took in this month", and because
 * it is the correct yardstick for sizing a daily-revenue threshold: today's cash
 * should be judged against this clinic's own typical daily cash, not a constant.
 */
export function collected30d(s: ClinicDataSnapshot): Metric {
  const value = paymentsInWindow(s, METRIC_WINDOWS.TRAILING_DAYS).reduce(
    (sum, p) => sum + p.amount,
    0,
  );
  return buildMetric(MetricKey.REVENUE_COLLECTED_30D, value, s.clinicId, s.date, s.asOf);
}
