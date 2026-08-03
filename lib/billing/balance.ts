/**
 * lib/billing/balance.ts
 *
 * Single shared implementation of the outstanding-balance calculation.
 *
 * Business rule (pilot):
 *   Outstanding balance =
 *     SUM(billable treatment cost + OPD fee + X-ray cost) - SUM(payments)
 *
 *   The OPD term closes a real accounting hole. A consultation fee could be
 *   COLLECTED (payments.payment_type = 'opd') but never CHARGED, and since the
 *   payments side of this subtraction has never filtered by type, a ₹300
 *   consultation payment reduced the patient's TREATMENT dues by ₹300. Charging
 *   the fee makes the two sides meet.
 *
 *   The X-ray term closes the same hole for radiographs. Migration
 *   20260724000000 introduced `xray_cost` on the assumption that the form would
 *   fold it into `treatments.cost` ("the combined total is submitted as
 *   treatments.cost ... and the billing formula is not changed"). The form never
 *   did — it collects Cost and X-ray Cost as two independent inputs and submits
 *   them as two independent columns. So an X-ray was recorded, shown on the
 *   treatment, and billed to nobody. Charging it here is what the migration
 *   intended; doing it as a separate term rather than by folding it into `cost`
 *   keeps the radiograph a visible line item and, critically, avoids having to
 *   guess whether any given historical `cost` already includes it (none do).
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
  /**
   * Whether a radiograph was taken during this visit, and what it cost.
   *
   * Both absent is treated as "no X-ray", so every caller and every row written
   * before X-ray billing existed keeps its current balance exactly.
   */
  xray_taken?: boolean | null;
  xray_cost?: number | string | null;
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

/**
 * Radiograph fee owed for one treatment: the recorded cost when an X-ray was
 * taken, nothing otherwise.
 *
 * Deliberately independent of the treatment's own status, for the same reason
 * as `opdChargeFor`. `xray_taken` is the clinician's assertion that a
 * radiograph was actually performed — film and machine time were consumed
 * whether the treatment that followed was completed, cancelled, or is still
 * only planned.
 */
export function xrayChargeFor(treatment: TreatmentLike): number {
  if (!treatment.xray_taken) return 0;
  return Math.max(0, Number(treatment.xray_cost ?? 0));
}

/** Total radiograph fees owed across a patient's treatments. */
export function sumXrayCharges(treatments: ReadonlyArray<TreatmentLike>): number {
  return treatments.reduce((sum, t) => sum + xrayChargeFor(t), 0);
}

/**
 * Everything one treatment adds to the patient's dues: its own cost when
 * billable, plus any consultation and radiograph fees recorded against it.
 *
 * This is the single definition of "what this line item is worth". Screens that
 * show a per-treatment or total charge MUST use this rather than reading `cost`
 * directly, or their figures stop reconciling with the outstanding balance —
 * which is precisely how the X-ray charge went missing from the patient's total
 * while still being displayed on the treatment.
 */
export function treatmentTotalCharge(treatment: TreatmentLike): number {
  const treatmentCost = isBillableTreatment(treatment.status)
    ? Number(treatment.cost ?? 0)
    : 0;
  return treatmentCost + opdChargeFor(treatment) + xrayChargeFor(treatment);
}

/** Total charges across a patient's treatments (cost + OPD + X-ray). */
export function sumTreatmentCharges(
  treatments: ReadonlyArray<TreatmentLike>
): number {
  return treatments.reduce((sum, t) => sum + treatmentTotalCharge(t), 0);
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
    sumTreatmentCharges(treatments) - sumPaymentAmounts(payments)
  );
}
