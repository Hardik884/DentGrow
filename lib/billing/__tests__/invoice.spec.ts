/**
 * lib/billing/invoice.ts — pure unit tests.
 *
 * These cover the edge cases the Billing & Payments spec calls out: no
 * treatment, one treatment, multiple treatments, OPD, X-ray, discount
 * (always 0 — no discount concept in the schema), partial payment, fully
 * paid, overpayment (clamped), and planned/cancelled treatments (excluded).
 *
 * No DB, no mocks — every input here is a plain object, matching how
 * lib/billing/balance.spec.ts and payout.spec.ts already test this layer.
 */

import { describe, expect, it } from "vitest";
import {
  buildAppointmentBillSummary,
  buildBill,
  buildBillLineItems,
  buildBillSummaries,
  buildInvoiceNumber,
  deriveBillStatus,
  sumLineItems,
  sumPaidForAppointment,
  type BillableTreatmentLike,
} from "@/lib/billing/invoice";

function treatment(overrides: Partial<BillableTreatmentLike> & { id: string }): BillableTreatmentLike {
  return {
    treatment_type: "Consultation",
    cost: 0,
    status: "completed",
    opd_charged: false,
    opd_fee: 0,
    xray_taken: false,
    xray_cost: 0,
    performed_at: "2026-08-01T00:00:00Z",
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildBillLineItems", () => {
  it("produces no line items for an empty treatment list", () => {
    expect(buildBillLineItems([])).toEqual([]);
  });

  it("produces one line item for a single billable treatment", () => {
    const items = buildBillLineItems([
      treatment({ id: "t1", treatment_type: "Filling", cost: 1500 }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      treatmentId: "t1",
      category: "treatment",
      description: "Filling",
      quantity: 1,
      rate: 1500,
      amount: 1500,
    });
  });

  it("splits OPD and X-ray into their own line items, on top of the treatment cost", () => {
    const items = buildBillLineItems([
      treatment({
        id: "t1",
        treatment_type: "Root Canal",
        cost: 8000,
        opd_charged: true,
        opd_fee: 300,
        xray_taken: true,
        xray_cost: 400,
      }),
    ]);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.category)).toEqual(["treatment", "opd", "xray"]);
    expect(sumLineItems(items)).toBe(8700); // 8000 + 300 + 400
  });

  it("orders multiple treatments' line items in input order", () => {
    const items = buildBillLineItems([
      treatment({ id: "a", treatment_type: "Cleaning", cost: 500 }),
      treatment({ id: "b", treatment_type: "Extraction", cost: 2000 }),
    ]);
    expect(items.map((i) => i.treatmentId)).toEqual(["a", "b"]);
  });

  it("excludes planned treatments' cost — no line item at all when nothing else was charged", () => {
    const items = buildBillLineItems([
      treatment({ id: "t1", treatment_type: "Crown (planned)", cost: 5000, status: "planned" }),
    ]);
    expect(items).toEqual([]);
  });

  it("excludes cancelled treatments' cost", () => {
    const items = buildBillLineItems([
      treatment({ id: "t1", treatment_type: "Cancelled visit", cost: 5000, status: "cancelled" }),
    ]);
    expect(items).toEqual([]);
  });

  it("still bills OPD/X-ray on a planned treatment — a consultation happened regardless of the outcome", () => {
    const items = buildBillLineItems([
      treatment({
        id: "t1",
        treatment_type: "Crown (planned)",
        cost: 5000,
        status: "planned",
        opd_charged: true,
        opd_fee: 300,
      }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ category: "opd", amount: 300 });
  });

  it("skips a zero-cost billable treatment (no charge, no line item)", () => {
    const items = buildBillLineItems([treatment({ id: "t1", cost: 0 })]);
    expect(items).toEqual([]);
  });
});

describe("deriveBillStatus", () => {
  it("is no_charge when total is 0", () => {
    expect(deriveBillStatus(0, 0)).toBe("no_charge");
  });
  it("is pending when nothing has been paid", () => {
    expect(deriveBillStatus(1000, 0)).toBe("pending");
  });
  it("is partial when paid is between 0 and total", () => {
    expect(deriveBillStatus(1000, 400)).toBe("partial");
  });
  it("is paid when paid equals total", () => {
    expect(deriveBillStatus(1000, 1000)).toBe("paid");
  });
  it("is paid (not some overpaid state) when paid exceeds total", () => {
    expect(deriveBillStatus(1000, 1500)).toBe("paid");
  });
});

describe("buildInvoiceNumber", () => {
  it("is deterministic for the same id", () => {
    const id = "3f9c1a2b-1111-2222-3333-444455556666";
    expect(buildInvoiceNumber("INV", id)).toBe(buildInvoiceNumber("INV", id));
  });
  it("differs for different ids", () => {
    expect(buildInvoiceNumber("INV", "aaaaaaaa-0000")).not.toBe(
      buildInvoiceNumber("INV", "bbbbbbbb-0000")
    );
  });
});

const OPTS = { invoiceNumber: "INV-TEST", invoiceDate: "2026-08-15" };

describe("buildBill (paid passed in directly)", () => {
  it("has no treatments → zero subtotal/total/balance, status no_charge", () => {
    const bill = buildBill([], 0, OPTS);
    expect(bill.subtotal).toBe(0);
    expect(bill.discount).toBe(0);
    expect(bill.total).toBe(0);
    expect(bill.paid).toBe(0);
    expect(bill.balanceDue).toBe(0);
    expect(bill.overpayment).toBe(0);
    expect(bill.status).toBe("no_charge");
  });

  it("discount is always 0 — no discount concept in the schema", () => {
    const bill = buildBill([treatment({ id: "t1", cost: 1000 })], 0, OPTS);
    expect(bill.discount).toBe(0);
    expect(bill.total).toBe(bill.subtotal);
  });

  // ── The exact reported-bug regression pair ─────────────────────────────
  it("REGRESSION total ₹8,000 / paid ₹7,700 → balance ₹300, status partial", () => {
    const bill = buildBill([treatment({ id: "t1", cost: 8000 })], 7700, OPTS);
    expect(bill.total).toBe(8000);
    expect(bill.paid).toBe(7700);
    expect(bill.balanceDue).toBe(300);
    expect(bill.overpayment).toBe(0);
    expect(bill.status).toBe("partial");
  });

  it("REGRESSION total ₹8,000 / paid ₹9,200 (overpaid) → balance ₹0, credit ₹1,200, status paid", () => {
    const bill = buildBill([treatment({ id: "t1", cost: 8000 })], 9200, OPTS);
    expect(bill.total).toBe(8000);
    expect(bill.paid).toBe(9200); // NOT clamped — the real amount paid is shown
    expect(bill.balanceDue).toBe(0);
    expect(bill.overpayment).toBe(1200); // surfaced as a credit, not hidden
    expect(bill.status).toBe("paid");
  });

  it("fully paid: balance due is 0, status paid, no overpayment", () => {
    const bill = buildBill([treatment({ id: "t1", cost: 5000 })], 5000, OPTS);
    expect(bill.balanceDue).toBe(0);
    expect(bill.overpayment).toBe(0);
    expect(bill.status).toBe("paid");
  });

  it("partial payment: balance = total − paid, status partial", () => {
    const bill = buildBill([treatment({ id: "t1", cost: 10000 })], 4000, OPTS);
    expect(bill.balanceDue).toBe(6000);
    expect(bill.status).toBe("partial");
  });

  it("multiple treatments with OPD and X-ray sum correctly", () => {
    const bill = buildBill(
      [
        treatment({ id: "a", treatment_type: "Root Canal", cost: 8000, opd_charged: true, opd_fee: 300, xray_taken: true, xray_cost: 400 }),
        treatment({ id: "b", treatment_type: "Crown", cost: 5000 }),
      ],
      10700,
      OPTS
    );
    expect(bill.subtotal).toBe(13000 + 700); // 8000 + 5000 + 300 + 400
    expect(bill.paid).toBe(10700);
    expect(bill.balanceDue).toBe(3000);
    expect(bill.status).toBe("partial");
  });
});

describe("buildBillSummaries", () => {
  it("omits treatments with nothing billed (e.g. planned, zero-cost)", () => {
    const summaries = buildBillSummaries(
      [
        treatment({ id: "planned", cost: 5000, status: "planned" }),
        treatment({ id: "zero", cost: 0 }),
      ],
      {}
    );
    expect(summaries).toEqual([]);
  });

  it("one summary row per billed treatment, with its own paid/balance", () => {
    const summaries = buildBillSummaries(
      [
        treatment({ id: "a", treatment_type: "Root Canal", cost: 10000 }),
        treatment({ id: "b", treatment_type: "Crown", cost: 5000 }),
        treatment({ id: "c", treatment_type: "Extraction", cost: 2000 }),
      ],
      { a: 10000, b: 5000, c: 0 } // pooled example from payment-allocation.spec.ts style
    );
    expect(summaries).toHaveLength(3);
    expect(summaries.find((s) => s.treatmentId === "a")).toMatchObject({
      total: 10000,
      paid: 10000,
      balanceDue: 0,
      status: "paid",
    });
    expect(summaries.find((s) => s.treatmentId === "c")).toMatchObject({
      total: 2000,
      paid: 0,
      balanceDue: 2000,
      status: "pending",
    });
  });
});

describe("buildAppointmentBillSummary (paid passed in directly)", () => {
  it("describes an appointment with no treatments at all as a plain 'Payment'", () => {
    const summary = buildAppointmentBillSummary([], 1500);
    expect(summary.treatmentDescription).toBe("Payment");
    expect(summary.total).toBe(0);
    expect(summary.paid).toBe(1500);
    expect(summary.balanceDue).toBe(0); // clamped — nothing was charged
    expect(summary.overpayment).toBe(1500); // all of it is credit
    expect(summary.status).toBe("no_charge"); // total <= 0 always reads no_charge
  });

  it("describes a single treatment by name", () => {
    const summary = buildAppointmentBillSummary(
      [treatment({ id: "t1", treatment_type: "Root Canal", cost: 9000 })],
      4000
    );
    expect(summary.treatmentDescription).toBe("Root Canal");
    expect(summary.total).toBe(9000);
    expect(summary.paid).toBe(4000);
    expect(summary.balanceDue).toBe(5000);
    expect(summary.status).toBe("partial");
  });

  it("describes multiple treatments as 'first + N more' and sums them all", () => {
    const summary = buildAppointmentBillSummary(
      [
        treatment({ id: "a", treatment_type: "Root Canal", cost: 8000 }),
        treatment({ id: "b", treatment_type: "Crown", cost: 5000 }),
        treatment({ id: "c", treatment_type: "Cleaning", cost: 500 }),
      ],
      13500
    );
    expect(summary.treatmentDescription).toBe("Root Canal + 2 more");
    expect(summary.total).toBe(13500);
    expect(summary.paid).toBe(13500);
    expect(summary.status).toBe("paid");
  });

  it("REGRESSION list and detail agree: total ₹8,000 / paid ₹7,700 → balance ₹300", () => {
    // The Billing LIST row (buildAppointmentBillSummary) and the bill DETAIL
    // (buildBill) are fed the SAME `paid` figure now, so they cannot diverge.
    const treatments = [treatment({ id: "t1", cost: 8000 })];
    const paid = 7700;
    const listRow = buildAppointmentBillSummary(treatments, paid);
    const detail = buildBill(treatments, paid, OPTS);
    expect(listRow.total).toBe(detail.total);
    expect(listRow.paid).toBe(detail.paid);
    expect(listRow.balanceDue).toBe(detail.balanceDue);
    expect(listRow).toMatchObject({ total: 8000, paid: 7700, balanceDue: 300 });
  });

  it("REGRESSION overpaid ₹9,200 on ₹8,000: balance ₹0, credit ₹1,200 in BOTH views", () => {
    const treatments = [treatment({ id: "t1", cost: 8000 })];
    const paid = 9200;
    const listRow = buildAppointmentBillSummary(treatments, paid);
    const detail = buildBill(treatments, paid, OPTS);
    expect(listRow.paid).toBe(9200);
    expect(listRow.balanceDue).toBe(0);
    expect(listRow.overpayment).toBe(1200);
    expect(listRow.balanceDue).toBe(detail.balanceDue);
    expect(listRow.overpayment).toBe(detail.overpayment);
  });

  it("still sums OPD/X-ray on a planned treatment even with zero cost contribution", () => {
    const summary = buildAppointmentBillSummary(
      [
        treatment({
          id: "t1",
          treatment_type: "Crown (planned)",
          cost: 5000,
          status: "planned",
          opd_charged: true,
          opd_fee: 300,
        }),
      ],
      0
    );
    expect(summary.total).toBe(300); // cost excluded (planned), OPD included
  });
});

describe("sumPaidForAppointment (single source of truth for per-appointment paid)", () => {
  const A = "appt-A";

  it("counts a payment linked directly to the appointment", () => {
    const paid = sumPaidForAppointment(
      [{ amount: 1500, appointment_id: A, treatment_id: null }],
      A,
      new Set()
    );
    expect(paid).toBe(1500);
  });

  it("counts a payment linked to one of the appointment's treatments", () => {
    const paid = sumPaidForAppointment(
      [{ amount: 6200, appointment_id: null, treatment_id: "t1" }],
      A,
      new Set(["t1"])
    );
    expect(paid).toBe(6200);
  });

  it("REGRESSION never double-counts an appointment-scoped payment (the ₹9,200 bug)", () => {
    // Reproduces the exact failing data: a ₹6,200 treatment-linked payment +
    // a ₹1,500 appointment-scoped payment (treatment_id null). Old list logic
    // counted the ₹1,500 twice (pool + unassigned) → ₹9,200. This sums each
    // row once → ₹7,700, the true amount paid.
    const payments = [
      { amount: 6200, appointment_id: A, treatment_id: "t1" },
      { amount: 1500, appointment_id: A, treatment_id: null },
    ];
    expect(sumPaidForAppointment(payments, A, new Set(["t1"]))).toBe(7700);
  });

  it("a payment counted once even if it carries BOTH an appointment_id and a treatment_id for this visit", () => {
    const payments = [{ amount: 5000, appointment_id: A, treatment_id: "t1" }];
    expect(sumPaidForAppointment(payments, A, new Set(["t1"]))).toBe(5000);
  });

  it("ignores another appointment's payments (no cross-visit leakage)", () => {
    const payments = [
      { amount: 5000, appointment_id: "appt-B", treatment_id: "t2" },
      { amount: 3000, appointment_id: null, treatment_id: "t2" }, // t2 belongs to B
    ];
    expect(sumPaidForAppointment(payments, A, new Set(["t1"]))).toBe(0);
  });

  it("a payment with an explicit other appointment_id is NOT pulled in by its treatment_id", () => {
    // appointment_id wins: this payment belongs to appt-B, even though its
    // treatment happens to be in A's set (inconsistent data guard).
    const payments = [{ amount: 4000, appointment_id: "appt-B", treatment_id: "t1" }];
    expect(sumPaidForAppointment(payments, A, new Set(["t1"]))).toBe(0);
  });

  it("sums multiple attributable payments exactly once each", () => {
    const payments = [
      { amount: 2000, appointment_id: A, treatment_id: "t1" },
      { amount: 1000, appointment_id: A, treatment_id: null },
      { amount: 500, appointment_id: null, treatment_id: "t2" },
    ];
    expect(sumPaidForAppointment(payments, A, new Set(["t1", "t2"]))).toBe(3500);
  });
});
