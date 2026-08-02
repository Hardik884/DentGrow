/**
 * Specs for the OPD consultation charge in the outstanding balance.
 *
 * This closes a real accounting hole rather than adding a feature. A
 * consultation fee could be COLLECTED (`payments.payment_type = 'opd'`) but
 * never CHARGED, and the balance subtracts every payment regardless of type — so
 * a ₹300 consultation payment reduced the patient's TREATMENT dues by ₹300 and
 * the clinic quietly under-billed.
 *
 * The two properties that matter most here are the backwards-compatible ones: a
 * treatment with no OPD fields must behave exactly as it did before, and turning
 * OPD off must remove the charge rather than leave it stranded.
 */

import { describe, expect, it } from "vitest";

import {
  computeOutstandingBalance,
  opdChargeFor,
  sumBillableTreatmentCost,
  sumOpdCharges,
} from "../balance";

const completed = (cost: number, opd?: { charged: boolean; fee: number }) => ({
  cost,
  status: "completed",
  ...(opd === undefined ? {} : { opd_charged: opd.charged, opd_fee: opd.fee }),
});

describe("opdChargeFor", () => {
  it("charges the fee recorded on the treatment", () => {
    expect(opdChargeFor(completed(5000, { charged: true, fee: 300 }))).toBe(300);
  });

  it("charges nothing when OPD is off", () => {
    expect(opdChargeFor(completed(5000, { charged: false, fee: 300 }))).toBe(0);
  });

  it("charges nothing when the treatment predates OPD entirely", () => {
    // Every production row today has no opd_fee column value. They must behave
    // exactly as before, or deploying this would move real patients' balances.
    expect(opdChargeFor(completed(5000))).toBe(0);
    expect(opdChargeFor({ cost: 5000, status: "completed", opd_charged: null, opd_fee: null }))
      .toBe(0);
  });

  it("reads a numeric column arriving as a string", () => {
    // Postgres numeric comes back as a string through PostgREST.
    expect(opdChargeFor({ cost: "5000.00", status: "completed", opd_charged: true, opd_fee: "300.00" }))
      .toBe(300);
  });

  it("never goes negative", () => {
    expect(opdChargeFor({ cost: 5000, status: "completed", opd_charged: true, opd_fee: -50 }))
      .toBe(0);
  });

  it("charges for the consultation regardless of the treatment's own status", () => {
    // The patient was seen and assessed whether or not the treatment that
    // followed was completed, cancelled, or is still only planned.
    for (const status of ["planned", "in_progress", "completed", "cancelled"]) {
      expect(opdChargeFor({ cost: 0, status, opd_charged: true, opd_fee: 300 })).toBe(300);
    }
  });
});

describe("outstanding balance with OPD", () => {
  it("adds the consultation fee to what the patient owes", () => {
    expect(computeOutstandingBalance([completed(5000, { charged: true, fee: 300 })], []))
      .toBe(5300);
  });

  it("lets an OPD payment settle the OPD charge instead of the treatment", () => {
    // The bug this fixes: before, this ₹300 payment left the balance at ₹4,700
    // against a ₹5,000 treatment, so the clinic lost ₹300 of treatment dues.
    const balance = computeOutstandingBalance(
      [completed(5000, { charged: true, fee: 300 })],
      [{ amount: 300 }],
    );
    expect(balance).toBe(5000);
  });

  it("leaves a pre-OPD patient's balance completely unchanged", () => {
    // The deploy-safety test. Existing rows carry no OPD fields.
    const treatments = [completed(5000), completed(1000), { cost: 9000, status: "planned" }];
    expect(sumBillableTreatmentCost(treatments)).toBe(6000);
    expect(sumOpdCharges(treatments)).toBe(0);
    expect(computeOutstandingBalance(treatments, [{ amount: 2000 }])).toBe(4000);
  });

  it("drops the charge when OPD is switched back off", () => {
    // The server zeroes the fee on toggle-off; this asserts the read side agrees
    // even if a stale fee were somehow left behind.
    expect(computeOutstandingBalance([completed(5000, { charged: false, fee: 300 })], []))
      .toBe(5000);
  });

  it("charges a consultation even when no treatment was billable", () => {
    // A consultation-only visit: the patient was seen, nothing was done yet.
    const balance = computeOutstandingBalance(
      [{ cost: 0, status: "planned", opd_charged: true, opd_fee: 300 }],
      [],
    );
    expect(balance).toBe(300);
  });

  it("still clamps an overpayment to zero", () => {
    expect(computeOutstandingBalance([completed(5000, { charged: true, fee: 300 })], [{ amount: 9999 }]))
      .toBe(0);
  });

  it("totals consultation fees across several visits", () => {
    expect(
      sumOpdCharges([
        completed(5000, { charged: true, fee: 300 }),
        completed(2000, { charged: true, fee: 300 }),
        completed(1000, { charged: false, fee: 300 }),
      ]),
    ).toBe(600);
  });
});
