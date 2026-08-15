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
 * A payment as seen by the bill layer — only the three fields that decide
 * which bill (appointment) a payment belongs to, plus its amount.
 */
export interface AttributablePayment {
  amount?: number | string | null;
  appointment_id?: string | null;
  treatment_id?: string | null;
}

/**
 * THE single source of truth for "how much has been paid on one appointment's
 * bill". A payment belongs to appointment A when it was recorded directly
 * against A (`appointment_id === A`) or, failing that, against one of A's
 * treatments (`treatment_id` ∈ A's treatments). Each payment row is counted
 * AT MOST ONCE.
 *
 * This is what both the clinic-wide Billing list and the individual bill
 * detail now use, so they can never disagree again. It deliberately does NOT
 * go through the per-treatment pooled allocator (`allocateCollectionsTo
 * Treatments`): pooling spreads unlinked money oldest-treatment-first across
 * the WHOLE patient ledger for consultant-payout purposes, which is the wrong
 * question for "what has been paid on THIS visit" and was the source of the
 * ₹9,200-vs-₹7,700 bug — the list added an appointment-scoped payment twice
 * (once via the pool, once as "unassigned"), the detail dropped it entirely.
 * Summing the actual payment rows attributed to the appointment counts every
 * rupee exactly once and needs no cross-appointment ordering.
 *
 * The pooled allocator is untouched and still drives per-treatment "collected"
 * and consultant payouts — a different question this does not replace.
 *
 * The `appointment_id`-first rule keeps the total unambiguous: a payment is
 * assigned to exactly one appointment, so summing per appointment can never
 * exceed the money actually taken.
 */
export function sumPaidForAppointment(
  payments: ReadonlyArray<AttributablePayment>,
  appointmentId: string,
  appointmentTreatmentIds: ReadonlySet<string>
): number {
  return payments.reduce((sum, p) => {
    const belongs =
      p.appointment_id === appointmentId ||
      (!p.appointment_id &&
        p.treatment_id != null &&
        appointmentTreatmentIds.has(p.treatment_id));
    return belongs ? sum + Math.max(0, Number(p.amount ?? 0)) : sum;
  }, 0);
}

/**
 * The full computed bill: line items plus subtotal/discount/total/paid/balance.
 *
 * `subtotal` and `total` are always equal — DentGrow has no discount concept
 * in its schema, so `discount` is always 0. The field still exists (rather
 * than being omitted) so a discount can be introduced later, additively,
 * without changing this shape.
 *
 * `overpayment` is `max(0, paid - total)` — surfaced rather than hidden so a
 * patient who paid more than the bill sees the credit instead of a silently
 * clamped balance.
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
  overpayment: number;
  status: BillStatus;
}

/**
 * Assemble a `Bill` from a set of treatments and an ALREADY-COMPUTED `paid`
 * figure.
 *
 * `paid` is the single number both the Billing list and this detail derive
 * the same way — via `sumPaidForAppointment` for an appointment bill, or the
 * pooled per-treatment collected amount for a single-treatment bill. buildBill
 * does not itself decide which payments count; it only turns charges + paid
 * into totals, so the list and the detail are guaranteed to agree.
 *
 * `paid` is NOT capped to `total`: an overpayment shows as a positive
 * `overpayment` and a zero `balanceDue`, never a hidden clamp.
 */
export function buildBill(
  treatments: ReadonlyArray<BillableTreatmentLike>,
  paid: number,
  opts: { invoiceNumber: string; invoiceDate: string }
): Bill {
  const lineItems = buildBillLineItems(treatments);
  const subtotal = sumLineItems(lineItems);
  const discount = 0;
  const total = subtotal - discount;

  const paidAmount = Math.max(0, paid);
  const balanceDue = Math.max(0, total - paidAmount);
  const overpayment = Math.max(0, paidAmount - total);

  return {
    invoiceNumber: opts.invoiceNumber,
    invoiceDate: opts.invoiceDate,
    lineItems,
    subtotal,
    discount,
    total,
    paid: paidAmount,
    balanceDue,
    overpayment,
    status: deriveBillStatus(total, paidAmount),
  };
}

/** One appointment's aggregated bill — the grouping the clinic-wide Billing list uses. */
export interface AppointmentBillSummary {
  treatmentDescription: string;
  total: number;
  paid: number;
  balanceDue: number;
  overpayment: number;
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
 * per VISIT — for the clinic-wide Billing list.
 *
 * `paid` is the SAME `sumPaidForAppointment` figure the individual bill detail
 * (`buildBill`) uses, so a visit's row here and its opened invoice always show
 * identical Total / Paid / Balance. It replaces the previous
 * `collectedByTreatment + unassignedPaidOnAppointment` formula, which
 * double-counted appointment-scoped payments (once via the pool, once as
 * "unassigned") and could not agree with the detail view.
 */
export function buildAppointmentBillSummary(
  treatments: ReadonlyArray<BillableTreatmentLike>,
  paid: number
): AppointmentBillSummary {
  const total = treatments.reduce((sum, t) => sum + treatmentTotalCharge(t), 0);
  const paidAmount = Math.max(0, paid);
  const balanceDue = Math.max(0, total - paidAmount);
  const overpayment = Math.max(0, paidAmount - total);

  return {
    treatmentDescription: describeTreatments(treatments),
    total,
    paid: paidAmount,
    balanceDue,
    overpayment,
    status: deriveBillStatus(total, paidAmount),
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
