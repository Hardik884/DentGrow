/**
 * Specs for the X-ray charge in the outstanding balance.
 *
 * The reported bug: a visit with a treatment and a ₹400 X-ray showed ₹600
 * outstanding where the clinic expected ₹1,000 — the radiograph was recorded
 * on the treatment, displayed on the treatment, and billed to nobody.
 *
 * Migration 20260724000000 added `xray_cost` believing the form would fold it
 * into `treatments.cost`. It never did: Cost and X-ray Cost are two independent
 * inputs writing two independent columns, and only the first was ever summed.
 *
 * As with OPD, the properties that matter most are the backwards-compatible
 * ones — a treatment with no X-ray fields must behave exactly as before, and
 * turning the X-ray off must remove the charge rather than strand it.
 */

import { describe, expect, it } from "vitest";

import {
  computeOutstandingBalance,
  sumTreatmentCharges,
  sumXrayCharges,
  treatmentTotalCharge,
  xrayChargeFor,
} from "../balance";

const completed = (cost: number, xray?: { taken: boolean; cost: number | null }) => ({
  cost,
  status: "completed",
  ...(xray === undefined ? {} : { xray_taken: xray.taken, xray_cost: xray.cost }),
});

describe("xrayChargeFor", () => {
  it("charges the cost recorded on the treatment", () => {
    expect(xrayChargeFor(completed(600, { taken: true, cost: 400 }))).toBe(400);
  });

  it("charges nothing when no X-ray was taken", () => {
    expect(xrayChargeFor(completed(600, { taken: false, cost: 400 }))).toBe(0);
  });

  it("charges nothing when the treatment predates X-ray billing entirely", () => {
    // Every row written before this change carries no X-ray values. They must
    // behave exactly as before, or deploying this moves real patients' balances.
    expect(xrayChargeFor(completed(600))).toBe(0);
    expect(xrayChargeFor({ cost: 600, status: "completed", xray_taken: null, xray_cost: null }))
      .toBe(0);
  });

  it("treats a taken X-ray with no recorded cost as free rather than NaN", () => {
    expect(xrayChargeFor({ cost: 600, status: "completed", xray_taken: true, xray_cost: null }))
      .toBe(0);
  });

  it("reads a numeric column arriving as a string", () => {
    // Postgres numeric comes back as a string through PostgREST.
    expect(
      xrayChargeFor({ cost: "600.00", status: "completed", xray_taken: true, xray_cost: "400.00" }),
    ).toBe(400);
  });

  it("never goes negative", () => {
    expect(xrayChargeFor({ cost: 600, status: "completed", xray_taken: true, xray_cost: -50 }))
      .toBe(0);
  });

  it("charges for the radiograph regardless of the treatment's own status", () => {
    // The film and machine time were consumed whether or not the treatment that
    // followed was completed, cancelled, or is still only planned.
    for (const status of ["planned", "in_progress", "completed", "cancelled"]) {
      expect(xrayChargeFor({ cost: 0, status, xray_taken: true, xray_cost: 400 })).toBe(400);
    }
  });
});

describe("outstanding balance with X-ray", () => {
  it("reproduces the clinic's reported case", () => {
    // ₹600 treatment + ₹400 X-ray. Showed ₹600; should be ₹1,000.
    expect(computeOutstandingBalance([completed(600, { taken: true, cost: 400 })], []))
      .toBe(1000);
  });

  it("adds the radiograph fee on top of an existing balance", () => {
    const treatments = [
      completed(2000),
      completed(600, { taken: true, cost: 400 }),
    ];
    // 2000 + 600 + 400, less 500 already paid.
    expect(computeOutstandingBalance(treatments, [{ amount: 500 }])).toBe(2500);
  });

  it("leaves a pre-X-ray patient's balance completely unchanged", () => {
    const treatments = [completed(5000), completed(1000), { cost: 9000, status: "planned" }];
    expect(sumXrayCharges(treatments)).toBe(0);
    expect(computeOutstandingBalance(treatments, [{ amount: 2000 }])).toBe(4000);
  });

  it("drops the charge when the X-ray is switched back off", () => {
    expect(computeOutstandingBalance([completed(600, { taken: false, cost: 400 })], []))
      .toBe(600);
  });

  it("charges a radiograph even when no treatment was billable", () => {
    // Imaging taken at a diagnostic visit; the work itself is planned for later.
    expect(
      computeOutstandingBalance(
        [{ cost: 9000, status: "planned", xray_taken: true, xray_cost: 400 }],
        [],
      ),
    ).toBe(400);
  });

  it("still clamps an overpayment to zero", () => {
    expect(
      computeOutstandingBalance([completed(600, { taken: true, cost: 400 })], [{ amount: 9999 }]),
    ).toBe(0);
  });

  it("totals radiograph fees across several visits", () => {
    expect(
      sumXrayCharges([
        completed(600, { taken: true, cost: 400 }),
        completed(2000, { taken: true, cost: 250 }),
        completed(1000, { taken: false, cost: 400 }),
      ]),
    ).toBe(650);
  });

  it("counts each charge exactly once when cost, OPD and X-ray all apply", () => {
    // The duplicate-counting guard: one treatment carrying all three terms.
    const t = {
      cost: 600,
      status: "completed",
      opd_charged: true,
      opd_fee: 300,
      xray_taken: true,
      xray_cost: 400,
    };
    expect(treatmentTotalCharge(t)).toBe(1300);
    expect(sumTreatmentCharges([t])).toBe(1300);
    expect(computeOutstandingBalance([t], [])).toBe(1300);
  });

  it("omits a cancelled treatment's cost but still bills its ancillaries", () => {
    // The treatment was called off; the consultation and the film still happened.
    const t = {
      cost: 5000,
      status: "cancelled",
      opd_charged: true,
      opd_fee: 300,
      xray_taken: true,
      xray_cost: 400,
    };
    expect(treatmentTotalCharge(t)).toBe(700);
  });
});
