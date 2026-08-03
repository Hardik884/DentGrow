/**
 * lib/billing/payout.ts
 *
 * Consultant payouts earned from money the clinic has ACTUALLY COLLECTED.
 *
 * The problem this replaces
 * ------------------------
 * `treatments.consultant_share` is computed once, at the moment the treatment
 * is recorded, from the treatment's full gross cost (see
 * lib/billing/revenue.ts → computeConsultantSplit). Analytics then summed that
 * column directly. The effect: a ₹10,000 treatment with a 40% consultant
 * immediately booked a ₹4,000 payout, even if the patient had paid nothing.
 * If the patient never came back, the clinic had already committed a payout
 * against money it never received.
 *
 * `consultant_share` remains correct and unchanged — it is the consultant's
 * ENTITLEMENT, what they are owed once the treatment is paid in full. What was
 * missing is the distinction between entitlement and EARNED payout. This module
 * supplies the second number, derived rather than stored, so it always reflects
 * the current state of the ledger.
 *
 * Because the payout is derived, payment edits, soft-deletes and back-dated
 * entries need no reconciliation step: recompute and the answer is right. There
 * is nothing to keep in sync and nothing to double-count.
 *
 * How a payment is applied
 * ------------------------
 * 1. A payment carrying `treatment_id` settles that treatment first. Anything
 *    beyond that treatment's total charge spills into the shared pool rather
 *    than inflating one line item.
 * 2. Unlinked payments (and spillover) form a pool applied to the patient's
 *    treatments OLDEST FIRST. This is ordinary accounts-receivable practice,
 *    and it is what keeps historical figures accurate: `payments.treatment_id`
 *    only arrived in migration 20260713000000, so every payment older than that
 *    is unlinked. Without pooling, every pre-existing payout would silently
 *    collapse to zero.
 * 3. Within one treatment, ANCILLARY charges settle before treatment cost —
 *    the OPD consultation fee and the X-ray, in that order. The consultant's
 *    share was computed from `cost` alone, so they have no claim on a
 *    consultation fee or a radiograph; letting the clinic recover those first
 *    means a payment that only covers the film never triggers a payout.
 *
 * The consultant then earns their entitlement in proportion to how much of the
 * treatment's own COST has been collected:
 *
 *     earned = entitlement x (cost collected / cost)
 *
 * which is self-capping — full payment earns exactly the entitlement, and
 * nothing can ever earn more.
 *
 * Worked example (the case the clinic reported):
 *     cost ₹10,000, consultant 40%, patient pays ₹3,000
 *     entitlement       = 4,000
 *     cost collected    = 3,000
 *     earned            = 4,000 x (3,000 / 10,000) = ₹1,200
 *
 * Refunds are out of scope because the schema has no concept of one:
 * `RecordPaymentSchema.amount` is `.positive()`, so a negative payment cannot
 * be recorded. If refunds are added later they flow through this function
 * unchanged — a reduced collected total simply yields a reduced payout.
 */

import {
  isBillableTreatment,
  opdChargeFor,
  treatmentTotalCharge,
  xrayChargeFor,
} from "./balance";

/** Round to 2 decimal places (currency). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface PayoutTreatmentLike {
  id: string;
  cost?: number | string | null;
  status?: string | null;
  consultant_id?: string | null;
  consultant_share?: number | string | null;
  opd_charged?: boolean | null;
  opd_fee?: number | string | null;
  xray_taken?: boolean | null;
  xray_cost?: number | string | null;
  /** Ordering keys for oldest-first pool allocation. */
  performed_at?: string | null;
  created_at?: string | null;
}

export interface PayoutPaymentLike {
  amount?: number | string | null;
  treatment_id?: string | null;
}

/** When this treatment happened, for oldest-first allocation. */
function treatmentOrderKey(t: PayoutTreatmentLike): string {
  return t.performed_at ?? t.created_at ?? "";
}

/**
 * How much money has been collected against each treatment.
 *
 * Returns a map of treatment id → amount collected, never exceeding that
 * treatment's total charge. Exported because it is the piece worth testing
 * directly and worth reusing if a per-treatment "collected" figure is ever
 * shown on screen.
 */
export function allocateCollectionsToTreatments(
  treatments: ReadonlyArray<PayoutTreatmentLike>,
  payments: ReadonlyArray<PayoutPaymentLike>
): Map<string, number> {
  const collected = new Map<string, number>();
  const charge = new Map<string, number>();
  for (const t of treatments) {
    collected.set(t.id, 0);
    charge.set(t.id, treatmentTotalCharge(t));
  }

  /** Credit a treatment up to its remaining charge; return the unused excess. */
  const credit = (treatmentId: string, amount: number): number => {
    const cap = charge.get(treatmentId) ?? 0;
    const already = collected.get(treatmentId) ?? 0;
    const room = Math.max(0, cap - already);
    const applied = Math.min(room, amount);
    collected.set(treatmentId, already + applied);
    return amount - applied;
  };

  // ── Pass 1: payments explicitly linked to a treatment ─────────────────────
  let pool = 0;
  for (const p of payments) {
    const amount = Math.max(0, Number(p.amount ?? 0));
    if (amount === 0) continue;
    if (p.treatment_id && charge.has(p.treatment_id)) {
      pool += credit(p.treatment_id, amount);
    } else {
      // Unlinked, or linked to a treatment outside this set (e.g. soft-deleted).
      pool += amount;
    }
  }

  // ── Pass 2: the pool, oldest treatment first ──────────────────────────────
  // Sorted by id as a tie-break so the result is deterministic for treatments
  // recorded at the same instant — otherwise two runs could split a pooled
  // payment differently and report different payouts for identical data.
  const ordered = [...treatments].sort((a, b) => {
    const ka = treatmentOrderKey(a);
    const kb = treatmentOrderKey(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  for (const t of ordered) {
    if (pool <= 0) break;
    pool = credit(t.id, pool);
  }

  return collected;
}

/**
 * The consultant's full entitlement on a treatment — what they are owed once it
 * is paid off. This is the stored `consultant_share`, which is what the older
 * accrual-style reporting paid out immediately.
 */
export function consultantEntitlement(t: PayoutTreatmentLike): number {
  if (!t.consultant_id) return 0;
  return Math.max(0, Number(t.consultant_share ?? 0));
}

/**
 * The consultant's EARNED payout on one treatment, given how much has been
 * collected against it.
 *
 * Ancillary charges (OPD, then X-ray) are settled before treatment cost, so a
 * payment that only covers the consultation or the radiograph earns nothing.
 */
export function earnedConsultantShare(
  t: PayoutTreatmentLike,
  collectedForTreatment: number
): number {
  const entitlement = consultantEntitlement(t);
  if (entitlement === 0) return 0;

  // The consultant's share was computed from `cost`, and only a billable
  // treatment puts its cost on the patient's bill at all.
  const costBase = isBillableTreatment(t.status) ? Math.max(0, Number(t.cost ?? 0)) : 0;
  if (costBase === 0) return 0;

  const ancillary = opdChargeFor(t) + xrayChargeFor(t);
  const costCollected = Math.max(0, collectedForTreatment - ancillary);

  const ratio = Math.min(1, costCollected / costBase);
  return round2(entitlement * ratio);
}

/**
 * Total consultant payout actually earned across a set of treatments, given the
 * payments recorded against them.
 *
 * Pass a patient's (or a clinic's) non-deleted treatments and non-deleted
 * payments. This is the number to report as "consultant payouts" anywhere that
 * previously summed `consultant_share`.
 */
export function sumEarnedConsultantPayouts(
  treatments: ReadonlyArray<PayoutTreatmentLike>,
  payments: ReadonlyArray<PayoutPaymentLike>
): number {
  const collected = allocateCollectionsToTreatments(treatments, payments);
  return round2(
    treatments.reduce(
      (sum, t) => sum + earnedConsultantShare(t, collected.get(t.id) ?? 0),
      0
    )
  );
}

/**
 * Payout still owed to consultants once the outstanding money comes in — the
 * gap between entitlement and what has been earned so far.
 *
 * Useful for showing a clinic what it is on the hook for WITHOUT booking it as
 * a cost today, which is exactly the distinction the accrual bug erased.
 */
export function sumUnearnedConsultantPayouts(
  treatments: ReadonlyArray<PayoutTreatmentLike>,
  payments: ReadonlyArray<PayoutPaymentLike>
): number {
  const collected = allocateCollectionsToTreatments(treatments, payments);
  return round2(
    treatments.reduce((sum, t) => {
      const earned = earnedConsultantShare(t, collected.get(t.id) ?? 0);
      return sum + Math.max(0, consultantEntitlement(t) - earned);
    }, 0)
  );
}
