/**
 * lib/billing/revenue.ts
 *
 * Single source of truth for consultant revenue distribution.
 *
 * Model
 * -----
 * - `cost` on a treatment is the GROSS amount. The patient always owes this in
 *   full (patient billing / outstanding balance never uses the split).
 * - When a consultant performs the treatment, part of the gross is paid out to
 *   the consultant (`consultant_share`) and the remainder is the clinic's NET
 *   revenue (`clinic_share`).
 * - When no consultant is involved, `consultant_share = 0` and
 *   `clinic_share = cost`.
 *
 * Every revenue calculation in the app derives from these helpers so payouts are
 * never computed twice or subtracted twice.
 */

export type CommissionType = "percentage" | "fixed";

export interface ConsultantSplit {
  consultantShare: number;
  clinicShare: number;
}

/** Round to 2 decimal places (currency). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compute the consultant / clinic split for a treatment.
 *
 * @param gross            The gross treatment amount (`treatments.cost`).
 * @param commissionType   'percentage' | 'fixed' | null/undefined.
 * @param commissionValue  Percent (0-100) for 'percentage', currency for 'fixed'.
 *
 * Returns the clamped shares. The consultant share can never exceed the gross
 * amount, and neither share can be negative.
 */
export function computeConsultantSplit(
  gross: number,
  commissionType: CommissionType | null | undefined,
  commissionValue: number | null | undefined
): ConsultantSplit {
  const safeGross = Number.isFinite(gross) && gross > 0 ? gross : 0;

  if (!commissionType || commissionValue == null || !Number.isFinite(commissionValue)) {
    return { consultantShare: 0, clinicShare: round2(safeGross) };
  }

  let consultantShare: number;
  if (commissionType === "percentage") {
    const pct = Math.min(100, Math.max(0, commissionValue));
    consultantShare = (safeGross * pct) / 100;
  } else {
    consultantShare = Math.max(0, commissionValue);
  }

  consultantShare = Math.min(safeGross, consultantShare);
  const clinicShare = safeGross - consultantShare;

  return { consultantShare: round2(consultantShare), clinicShare: round2(clinicShare) };
}

/** Shape shared by treatment rows used in revenue aggregation. */
export interface RevenueTreatmentLike {
  cost?: number | string | null;
  clinic_share?: number | string | null;
  consultant_share?: number | string | null;
}

/**
 * NET clinic revenue for a single treatment.
 * Uses stored `clinic_share`; falls back to `cost` for legacy rows written
 * before revenue distribution existed (where the clinic kept the full amount).
 */
export function treatmentClinicShare(t: RevenueTreatmentLike): number {
  if (t.clinic_share !== null && t.clinic_share !== undefined) {
    return Number(t.clinic_share);
  }
  return Number(t.cost ?? 0);
}

/** Consultant payout for a single treatment (0 when none). */
export function treatmentConsultantShare(t: RevenueTreatmentLike): number {
  if (t.consultant_share !== null && t.consultant_share !== undefined) {
    return Number(t.consultant_share);
  }
  return 0;
}
