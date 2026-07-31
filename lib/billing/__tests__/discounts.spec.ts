/**
 * Specs for discounts in the outstanding-balance calculation.
 *
 * This is money owed by a real patient, so the behaviour worth pinning is
 * narrow and unglamorous: a discount must come off what they owe, exactly once,
 * and never off somebody else's bill.
 *
 * The absent-column case matters most. Every caller that forgets to select
 * `discount_amount` gets `undefined`, which must behave as "no discount" rather
 * than throwing or producing NaN — the failure has to be a slightly-too-high
 * number caught by billing-selects.spec.ts, not a crashed page.
 */

import { describe, expect, it } from "vitest";

import {
  computeOutstandingBalance,
  netTreatmentCost,
  sumBillableDiscounts,
  sumBillableTreatmentCost,
} from "../balance";

const completed = (cost: number, discount?: number) => ({
  cost,
  status: "completed",
  ...(discount === undefined ? {} : { discount_amount: discount }),
});

describe("netTreatmentCost", () => {
  it("takes the discount off the gross cost", () => {
    expect(netTreatmentCost(completed(5000, 500))).toBe(4500);
  });

  it("treats an absent discount as zero rather than failing", () => {
    // A query that did not select the column must still produce a usable
    // number. billing-selects.spec.ts is what stops that happening; this makes
    // sure it degrades safely when it does.
    expect(netTreatmentCost(completed(5000))).toBe(5000);
    expect(netTreatmentCost({ cost: 5000, status: "completed", discount_amount: null })).toBe(5000);
  });

  it("handles numeric columns arriving as strings", () => {
    // Postgres numeric comes back as a string through PostgREST.
    expect(netTreatmentCost({ cost: "5000.00", status: "completed", discount_amount: "500.00" }))
      .toBe(4500);
  });

  it("never goes negative, so one treatment cannot pay off another", () => {
    // The database CHECK forbids this, but a clamp here means a bad row cannot
    // quietly reduce the rest of the patient's bill.
    expect(netTreatmentCost(completed(1000, 5000))).toBe(0);
  });
});

describe("outstanding balance", () => {
  it("reduces what the patient owes", () => {
    const balance = computeOutstandingBalance([completed(5000, 1000)], []);
    expect(balance).toBe(4000);
  });

  it("applies the discount exactly once, alongside payments", () => {
    // 5000 billed, 1000 off, 2000 paid.
    expect(computeOutstandingBalance([completed(5000, 1000)], [{ amount: 2000 }])).toBe(2000);
  });

  it("can settle a bill entirely", () => {
    expect(computeOutstandingBalance([completed(5000, 5000)], [])).toBe(0);
  });

  it("ignores discounts on treatments that were never billable", () => {
    // A planned or cancelled treatment contributes nothing, so neither does its
    // discount — otherwise a discount on cancelled work would credit the patient
    // against unrelated bills.
    const balance = computeOutstandingBalance(
      [
        completed(5000, 1000),
        { cost: 9000, status: "planned", discount_amount: 9000 },
        { cost: 3000, status: "cancelled", discount_amount: 3000 },
      ],
      [],
    );
    expect(balance).toBe(4000);
  });

  it("still clamps an overpayment to zero", () => {
    expect(computeOutstandingBalance([completed(5000, 1000)], [{ amount: 9999 }])).toBe(0);
  });

  it("matches the undiscounted result when nothing was discounted", () => {
    // The live clinic's existing data has no discounts; its numbers must not
    // move at all.
    const treatments = [completed(5000), completed(1000), { cost: 9000, status: "planned" }];
    expect(sumBillableTreatmentCost(treatments)).toBe(6000);
    expect(computeOutstandingBalance(treatments, [{ amount: 3000 }])).toBe(3000);
  });
});

describe("sumBillableDiscounts", () => {
  it("totals concessions across billable treatments only", () => {
    const total = sumBillableDiscounts([
      completed(5000, 500),
      completed(2000, 250),
      { cost: 9000, status: "planned", discount_amount: 9000 },
    ]);
    expect(total).toBe(750);
  });

  it("is zero when nothing was discounted", () => {
    expect(sumBillableDiscounts([completed(5000), completed(2000)])).toBe(0);
  });
});
