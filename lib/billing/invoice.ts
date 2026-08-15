/**
 * lib/billing/invoice.ts
 *
 * Pure, DB-free helpers that turn already-fetched treatments + a per-treatment
 * "collected" map into the line items and summary figures a bill/invoice shows.
 *
 * This file computes NOTHING new about money. Every charge and every collected
 * amount comes from `lib/billing/balance.ts` and `lib/billing/payout.ts` — the
 * single canonical implementations `actions/payments.ts`, `PatientPaymentsTab`,
 * `AppointmentPaymentsSection` and the Business Brain diagnosis layer already
 * import directly. This module only:
 *   1. Decomposes `treatmentTotalCharge` back into its three named parts
 *      (treatment cost, OPD fee, X-ray fee) as separate line items, using the
 *      same `opdChargeFor` / `xrayChargeFor` accessors those totals already use.
 *   2. Derives a deterministic, presentational invoice number and a
 *      paid/partial/pending status label from numbers computed elsewhere.
 *
 * There is no `discount` column anywhere in the schema (patients, treatments,
 * payments) — discount is always 0. A bill is a live, computed view over the
 * canonical data, never a persisted document, so it cannot drift from the
 * balance shown anywhere else in the app, and it has no separate lifecycle
 * (draft/issued) to keep in sync — see the doc comment on `Bill` below.
 */

import {
  isBillableTreatment,
  opdChargeFor,
  treatmentTotalCharge,
  xrayChargeFor,
} from "./balance";

export type BillLineItemCategory = "treatment" | "opd" | "xray";

export interface BillableTreatmentLike {
  id: string;
  treatment_type: string;
  cost?: number | string | null;
  status?: string | null;
  opd_charged?: boolean | null;
  opd_fee?: number | string | null;
  xray_taken?: boolean | null;
  xray_cost?: number | string | null;
  performed_at?: string | null;
  created_at?: string | null;
}

export interface BillLineItem {
  /** Stable React key: `${treatmentId}:${category}`. */
  key: string;
  treatmentId: string;
  category: BillLineItemCategory;
  description: string;
  quantity: 1;
  rate: number;
  amount: number;
}

/** Paid/partial/pending status for one bill, derived from total vs. paid. */
export type BillStatus = "paid" | "partial" | "pending" | "no_charge";

/**
 * One line item per non-zero charge on a treatment: the treatment's own cost
 * (only when billable), plus OPD and X-ray as separate rows when charged.
 *
 * Deliberately decomposes `treatmentTotalCharge` rather than showing one row
 * per treatment, so an itemized bill actually itemizes — a patient who was
 * charged a consultation fee and a radiograph on top of a filling sees three
 * distinct amounts, matching what `AppointmentPaymentsSection` already breaks
 * out per-treatment. The three rows for one treatment always sum to exactly
 * `treatmentTotalCharge(treatment)`.
 *
 * A treatment that is planned/cancelled (not billable) and was never charged
 * OPD or X-ray produces zero line items — it simply doesn't appear on the
 * bill, consistent with it not counting toward the outstanding balance.
 */
export function buildBillLineItems(
  treatments: ReadonlyArray<BillableTreatmentLike>
): BillLineItem[] {
  const items: BillLineItem[] = [];

  for (const t of treatments) {
    if (isBillableTreatment(t.status)) {
      const rate = Number(t.cost ?? 0);
      if (rate > 0) {
        items.push({
          key: `${t.id}:treatment`,
          treatmentId: t.id,
          category: "treatment",
          description: t.treatment_type,
          quantity: 1,
          rate,
          amount: rate,
        });
      }
    }

    const opd = opdChargeFor(t);
    if (opd > 0) {
      items.push({
        key: `${t.id}:opd`,
        treatmentId: t.id,
        category: "opd",
        description: `OPD / Consultation Charge — ${t.treatment_type}`,
        quantity: 1,
        rate: opd,
        amount: opd,
      });
    }

    const xray = xrayChargeFor(t);
    if (xray > 0) {
      items.push({
        key: `${t.id}:xray`,
        treatmentId: t.id,
        category: "xray",
        description: `X-Ray Charge — ${t.treatment_type}`,
        quantity: 1,
        rate: xray,
        amount: xray,
      });
    }
  }

  return items;
}

/**
 * Paid/partial/pending, from the same total-vs-paid comparison
 * `AppointmentPaymentsSection`'s `derivePaymentStatus` already uses. Kept as
 * its own tiny pure function here (rather than importing that component's
 * private helper) so this module has no dependency on UI code — the four-line
 * comparison itself is not "the canonical calculation" the audit protects,
 * only the underlying total and paid figures are, and those are both passed
 * in already computed by the caller.
 */
export function deriveBillStatus(total: number, paid: number): BillStatus {
  if (total <= 0) return "no_charge";
  if (paid <= 0) return "pending";
  if (paid >= total) return "paid";
  return "partial";
}

/**
 * A deterministic, presentational invoice number derived from the id of the
 * document it represents (an appointment, or a single treatment). Not a
 * persisted sequence — DentGrow has no `bills` table and this module
 * deliberately does not add one (see file header). Same id always produces
 * the same number, so re-opening a bill after new charges or payments never
 * changes its identity, only its displayed totals — which is the intended
 * behaviour: a live document, not a frozen one, per DentGrow's billing rules.
 */
export function buildInvoiceNumber(prefix: string, id: string): string {
  const compact = id.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefix}-${compact}`;
}

/** Sum of `rate * quantity` across line items — the bill's subtotal. */
export function sumLineItems(items: ReadonlyArray<BillLineItem>): number {
  return items.reduce((sum, i) => sum + i.amount, 0);
}

/**
 * The full computed bill: line items plus subtotal/discount/total/paid/balance.
 *
 * `subtotal` and `total` are always equal — DentGrow has no discount concept
 * in its schema, so `discount` is always 0. The field still exists (rather
 * than being omitted) so a discount can be introduced later, additively,
 * without changing this shape.
 */
export interface Bill {
  invoiceNumber: string;
  invoiceDate: string;
  lineItems: BillLineItem[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balanceDue: number;
  status: BillStatus;
}

/**
 * Assemble a `Bill` from a set of treatments and the amount already collected
 * against each (from `allocateCollectionsToTreatments` / the
 * `getPatientTreatmentCollections` / `getPortalTreatmentCollections` actions).
 *
 * `collectedByTreatment` MUST be computed via the canonical pooled allocator —
 * never re-derived here — so a bill's "Paid" always matches the figure shown
 * on the appointment/patient payments panel for the same treatments.
 */
export function buildBill(
  treatments: ReadonlyArray<BillableTreatmentLike>,
  collectedByTreatment: Readonly<Record<string, number>>,
  opts: { invoiceNumber: string; invoiceDate: string }
): Bill {
  const lineItems = buildBillLineItems(treatments);
  const subtotal = sumLineItems(lineItems);
  const discount = 0;
  const total = subtotal - discount;

  const treatmentIds = new Set(treatments.map((t) => t.id));
  let paid = 0;
  for (const id of treatmentIds) {
    paid += Math.min(collectedByTreatment[id] ?? 0, treatmentTotalCharge(
      treatments.find((t) => t.id === id)!
    ));
  }
  // Paid can't exceed what was actually charged on THIS bill's line items —
  // allocation is capped per-treatment by the canonical allocator already, so
  // this clamp is a no-op in practice, kept only as a defensive invariant.
  paid = Math.min(paid, total);

  const balanceDue = Math.max(0, total - paid);

  return {
    invoiceNumber: opts.invoiceNumber,
    invoiceDate: opts.invoiceDate,
    lineItems,
    subtotal,
    discount,
    total,
    paid,
    balanceDue,
    status: deriveBillStatus(total, paid),
  };
}

/** One appointment's aggregated bill — the grouping the clinic-wide Billing list uses. */
export interface AppointmentBillSummary {
  treatmentDescription: string;
  total: number;
  paid: number;
  balanceDue: number;
  status: BillStatus;
}

/** "Root Canal", "Root Canal + 2 more", or "Payment" when there are no treatment rows at all. */
function describeTreatments(treatments: ReadonlyArray<{ treatment_type: string }>): string {
  if (treatments.length === 0) return "Payment";
  const [first, ...rest] = treatments.map((t) => t.treatment_type);
  return rest.length === 0 ? first : `${first} + ${rest.length} more`;
}

/**
 * Aggregate one appointment's treatments into a single bill row — one row
 * per VISIT rather than one per treatment, for the clinic-wide Billing list.
 *
 * `paid` combines two already-canonical numbers, nothing new is computed:
 *   1. the same per-treatment pooled `collectedByTreatment` map every other
 *      billing screen reads (from `allocateCollectionsToTreatments`), summed
 *      for this appointment's treatments — exactly what
 *      `AppointmentPaymentsSection` already does per treatment card, just
 *      totalled to one visit figure.
 *   2. `unassignedPaidOnAppointment` — payments recorded against this
 *      appointment with no `treatment_id`, the same figure
 *      `AppointmentPaymentsSection` already surfaces as "Other Payments".
 * Without (2) a visit paid for entirely via an unlinked/OPD-only payment
 * (no treatment row at all) would show as unpaid even though money was
 * actually collected on it.
 */
export function buildAppointmentBillSummary(
  treatments: ReadonlyArray<BillableTreatmentLike>,
  collectedByTreatment: Readonly<Record<string, number>>,
  unassignedPaidOnAppointment = 0
): AppointmentBillSummary {
  const total = treatments.reduce((sum, t) => sum + treatmentTotalCharge(t), 0);
  const paidFromTreatments = treatments.reduce(
    (sum, t) => sum + Math.min(collectedByTreatment[t.id] ?? 0, treatmentTotalCharge(t)),
    0
  );
  const paid = paidFromTreatments + Math.max(0, unassignedPaidOnAppointment);
  const balanceDue = Math.max(0, total - paid);

  return {
    treatmentDescription: describeTreatments(treatments),
    total,
    paid,
    balanceDue,
    status: deriveBillStatus(total, paid),
  };
}

/** Compact summary row for a bills list (patient portal "My Bills", patient-profile "Bill" list). */
export interface BillSummary {
  treatmentId: string;
  appointmentId: string | null;
  treatmentType: string;
  treatmentDate: string | null;
  total: number;
  paid: number;
  balanceDue: number;
  status: BillStatus;
}

/**
 * One summary row per BILLABLE treatment that actually carries a charge
 * (cost, OPD or X-ray > 0) — treatments with nothing billed on them (e.g. a
 * `planned` treatment, or a completed one with a zero cost and no ancillary
 * charges) produce no bill row, matching "each treatment must have its own
 * bill WHERE APPLICABLE" from the spec.
 */
export function buildBillSummaries(
  treatments: ReadonlyArray<BillableTreatmentLike>,
  collectedByTreatment: Readonly<Record<string, number>>
): BillSummary[] {
  return treatments
    .map((t) => {
      const total = treatmentTotalCharge(t);
      if (total <= 0) return null;
      const paid = Math.min(collectedByTreatment[t.id] ?? 0, total);
      const balanceDue = Math.max(0, total - paid);
      const summary: BillSummary = {
        treatmentId: t.id,
        appointmentId: null,
        treatmentType: t.treatment_type,
        treatmentDate: t.performed_at ?? t.created_at ?? null,
        total,
        paid,
        balanceDue,
        status: deriveBillStatus(total, paid),
      };
      return summary;
    })
    .filter((s): s is BillSummary => s !== null);
}
