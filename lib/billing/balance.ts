/**
 * lib/billing/balance.ts
 *
 * Single shared implementation of the outstanding-balance calculation.
 *
 * Business rule (pilot):
 *   Outstanding balance = SUM(billable treatment cost) - SUM(payments)
 *
 *   A treatment is BILLABLE only when its status is `completed` or
 *   `in_progress`. Treatments that are `planned` (future / not yet started)
 *   or `cancelled` must NEVER contribute to a patient's dues.
 *
 *   The result is clamped to >= 0 so an over-payment never shows as a
 *   negative balance.
 *
 * Every screen (dashboard, patient profile, patient portal, analytics,
 * payments, AI assistant, summary cards) MUST compute balance through these
 * helpers so the displayed number is always consistent.
 */

/** Treatment statuses that contribute to a patient's outstanding balance. */
export const BILLABLE_TREATMENT_STATUSES = ["completed", "in_progress"] as const;

export type BillableTreatmentStatus = (typeof BILLABLE_TREATMENT_STATUSES)[number];

/** True when a treatment status counts towards the patient's dues. */
export function isBillableTreatment(status: string | null | undefined): boolean {
  return (
    !!status &&
    (BILLABLE_TREATMENT_STATUSES as readonly string[]).includes(status)
  );
}

type TreatmentLike = { cost?: number | string | null; status?: string | null };
type PaymentLike = { amount?: number | string | null };

/** Sum of cost for billable treatments only. */
export function sumBillableTreatmentCost(
  treatments: ReadonlyArray<TreatmentLike>
): number {
  return treatments.reduce(
    (sum, t) => (isBillableTreatment(t.status) ? sum + Number(t.cost ?? 0) : sum),
    0
  );
}

/** Sum of all (non-deleted) payment amounts. */
export function sumPaymentAmounts(
  payments: ReadonlyArray<PaymentLike>
): number {
  return payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
}

/**
 * Outstanding balance for a patient.
 * Pass the patient's (non-deleted) treatments and payments.
 */
export function computeOutstandingBalance(
  treatments: ReadonlyArray<TreatmentLike>,
  payments: ReadonlyArray<PaymentLike>
): number {
  return Math.max(
    0,
    sumBillableTreatmentCost(treatments) - sumPaymentAmounts(payments)
  );
}
