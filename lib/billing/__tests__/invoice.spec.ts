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

describe("buildBill", () => {
  it("has no treatments → zero subtotal/total/balance, status no_charge", () => {
    const bill = buildBill([], {}, { invoiceNumber: "INV-TEST", invoiceDate: "2026-08-15" });
    expect(bill.subtotal).toBe(0);
    expect(bill.discount).toBe(0);
    expect(bill.total).toBe(0);
    expect(bill.paid).toBe(0);
    expect(bill.balanceDue).toBe(0);
    expect(bill.status).toBe("no_charge");
  });

  it("discount is always 0 — no discount concept in the schema", () => {
    const bill = buildBill(
      [treatment({ id: "t1", cost: 1000 })],
      {},
      { invoiceNumber: "INV-TEST", invoiceDate: "2026-08-15" }
    );
    expect(bill.discount).toBe(0);
    expect(bill.total).toBe(bill.subtotal);
  });

  it("partial payment: balance due is total minus collected, status partial", () => {
    const bill = buildBill(
      [treatment({ id: "t1", cost: 10000 })],
      { t1: 4000 },
      { invoiceNumber: "INV-TEST", invoiceDate: "2026-08-15" }
    );
    expect(bill.total).toBe(10000);
    expect(bill.paid).toBe(4000);
    expect(bill.balanceDue).toBe(6000);
    expect(bill.status).toBe("partial");
  });

  it("fully paid: balance due is 0, status paid", () => {
    const bill = buildBill(
      [treatment({ id: "t1", cost: 5000 })],
      { t1: 5000 },
      { invoiceNumber: "INV-TEST", invoiceDate: "2026-08-15" }
    );
    expect(bill.balanceDue).toBe(0);
    expect(bill.status).toBe("paid");
  });

  it("overpayment is clamped — balance due never goes negative", () => {
    const bill = buildBill(
      [treatment({ id: "t1", cost: 5000 })],
      { t1: 7000 }, // over-collected (e.g. allocator credited more via pooling upstream)
      { invoiceNumber: "INV-TEST", invoiceDate: "2026-08-15" }
    );
    expect(bill.balanceDue).toBe(0);
    expect(bill.paid).toBe(5000); // clamped to what this bill actually charged
    expect(bill.status).toBe("paid");
  });

  it("multiple treatments with OPD and X-ray sum correctly", () => {
    const bill = buildBill(
      [
        treatment({ id: "a", treatment_type: "Root Canal", cost: 8000, opd_charged: true, opd_fee: 300, xray_taken: true, xray_cost: 400 }),
        treatment({ id: "b", treatment_type: "Crown", cost: 5000 }),
      ],
      { a: 8700, b: 2000 },
      { invoiceNumber: "INV-TEST", invoiceDate: "2026-08-15" }
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

describe("buildAppointmentBillSummary", () => {
  it("describes an appointment with no treatments at all as a plain 'Payment'", () => {
    const summary = buildAppointmentBillSummary([], {}, 1500);
    expect(summary.treatmentDescription).toBe("Payment");
    expect(summary.total).toBe(0);
    expect(summary.paid).toBe(1500);
    expect(summary.balanceDue).toBe(0); // clamped — nothing was charged
    expect(summary.status).toBe("no_charge"); // total <= 0 always reads no_charge
  });

  it("describes a single treatment by name", () => {
    const summary = buildAppointmentBillSummary(
      [treatment({ id: "t1", treatment_type: "Root Canal", cost: 9000 })],
      { t1: 4000 }
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
      { a: 8000, b: 5000, c: 500 }
    );
    expect(summary.treatmentDescription).toBe("Root Canal + 2 more");
    expect(summary.total).toBe(13500);
    expect(summary.paid).toBe(13500);
    expect(summary.status).toBe("paid");
  });

  it("adds unassigned-to-treatment payments on top of the pooled per-treatment paid", () => {
    // A visit paid partly via a payment linked to the treatment (in the
    // collected map) and partly via a separate, unlinked payment recorded on
    // the same appointment (e.g. an OPD payment with no treatment_id).
    const summary = buildAppointmentBillSummary(
      [treatment({ id: "t1", treatment_type: "Extraction", cost: 3000 })],
      { t1: 2000 },
      500
    );
    expect(summary.total).toBe(3000);
    expect(summary.paid).toBe(2500);
    expect(summary.balanceDue).toBe(500);
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
      {}
    );
    expect(summary.total).toBe(300); // cost excluded (planned), OPD included
  });
});
