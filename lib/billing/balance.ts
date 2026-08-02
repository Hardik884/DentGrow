/**
 * lib/billing/balance.ts
 *
 * Single shared implementation of the outstanding-balance calculation.
 *
 * Business rule (pilot):
 *   Outstanding balance = SUM(billable treatment cost + OPD fee) - SUM(payments)
 *
 *   The OPD term closes a real accounting hole. A consultation fee could be
 *   COLLECTED (payments.payment_type = 'opd') but never CHARGED, and since the
 *   payments side of this subtraction has never filtered by type, a ₹300
 *   consultation payment reduced the patient's TREATMENT dues by ₹300. Charging
 *   the fee makes the two sides meet.
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
   * Whether a consultation fee is owed for this visit, and how much.
   *
   * Both absent is treated as "no OPD", which keeps every caller written before
   * OPD existed correct. The fee is read from the treatment rather than from
   * clinic settings on purpose — see the migration note; settings hold the
   * CURRENT fee and using it here would re-price historical bills.
   */
  opd_charged?: boolean | null;
  opd_fee?: number | string | null;
};
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

/**
 * Consultation fee owed for one treatment: the snapshotted fee when OPD was
 * charged, nothing otherwise.
 *
 * Deliberately independent of the treatment's own status. A consultation
 * happened whether or not the treatment that followed was completed, cancelled
 * or is still planned — the patient was seen and assessed either way.
 */
export function opdChargeFor(treatment: TreatmentLike): number {
  if (!treatment.opd_charged) return 0;
  return Math.max(0, Number(treatment.opd_fee ?? 0));
}

/** Total consultation fees owed across a patient's treatments. */
export function sumOpdCharges(treatments: ReadonlyArray<TreatmentLike>): number {
  return treatments.reduce((sum, t) => sum + opdChargeFor(t), 0);
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
    sumBillableTreatmentCost(treatments) +
      sumOpdCharges(treatments) -
      sumPaymentAmounts(payments)
  );
}
