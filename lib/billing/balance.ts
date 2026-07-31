/**
 * lib/billing/balance.ts
 *
 * Single shared implementation of the outstanding-balance calculation.
 *
 * Business rule (pilot):
 *   Outstanding balance = SUM(billable treatment cost - discount) - SUM(payments)
 *
 *   `treatments.cost` is the GROSS list price and `discount_amount` is what was
 *   taken off it, so what the patient owes is the difference. Every screen must
 *   net the discount off; a screen that forgets it over-states the patient's
 *   dues, which is the kind of error a clinic discovers from a complaint rather
 *   than from a log. `billing-selects.spec.ts` scans the codebase for treatment
 *   queries that feed these helpers and fails if one omits the column.
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

type TreatmentLike = {
  cost?: number | string | null;
  status?: string | null;
  /**
   * Absent is treated as zero, which keeps every pre-discount caller correct.
   * That leniency is why the guard spec exists: absence cannot be distinguished
   * from a genuine zero at runtime, so it is enforced at the query instead.
   */
  discount_amount?: number | string | null;
};
type PaymentLike = { amount?: number | string | null };

/**
 * What a single billable treatment adds to the patient's dues: gross cost less
 * any discount, floored at zero.
 *
 * Floored defensively even though a CHECK constraint forbids a discount larger
 * than the cost — one treatment must never be able to reduce what the patient
 * owes for another.
 */
export function netTreatmentCost(treatment: TreatmentLike): number {
  const gross = Number(treatment.cost ?? 0);
  const discount = Number(treatment.discount_amount ?? 0);
  return Math.max(0, gross - discount);
}

/** Sum of NET cost (gross less discount) for billable treatments only. */
export function sumBillableTreatmentCost(
  treatments: ReadonlyArray<TreatmentLike>
): number {
  return treatments.reduce(
    (sum, t) => (isBillableTreatment(t.status) ? sum + netTreatmentCost(t) : sum),
    0
  );
}

/** Total discount given across billable treatments. */
export function sumBillableDiscounts(
  treatments: ReadonlyArray<TreatmentLike>
): number {
  return treatments.reduce(
    (sum, t) =>
      isBillableTreatment(t.status) ? sum + Number(t.discount_amount ?? 0) : sum,
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
