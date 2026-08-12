/**
 * Regression: the clinic-wide outstanding total must be the SUM of each
 * patient's own clamped balance, not a single clinic-level clamp (audit A5).
 *
 * The analytics "Remaining" card previously did `max(0, Σcharges − Σpaid)` over
 * the whole clinic, which let one patient's overpayment or prepaid deposit erase
 * another patient's genuine debt. `computeClinicOutstandingBalance` fixes that by
 * reusing the per-patient `computeOutstandingBalance` — these pin the difference.
 */

import { describe, expect, it } from "vitest";

import {
  computeClinicOutstandingBalance,
  computeOutstandingBalance,
} from "../balance";

describe("computeClinicOutstandingBalance (audit A5)", () => {
  it("clamps per patient — one patient's overpayment can't cancel another's debt", () => {
    const treatments = [
      { patient_id: "A", cost: 1000, status: "completed" },
      { patient_id: "C", cost: 800, status: "completed" },
    ];
    // A overpaid by 500; C still owes 800. Clinic-level netting would read 300.
    const payments = [{ patient_id: "A", amount: 1500 }];
    expect(computeClinicOutstandingBalance(treatments, payments)).toBe(800);
  });

  it("a deposit on one patient's planned work stays with that patient", () => {
    const treatments = [
      { patient_id: "A", cost: 1000, status: "completed" },
      { patient_id: "B", cost: 5000, status: "planned" }, // non-billable
    ];
    // B's 1000 deposit sits against B's not-yet-owed work; it must NOT reduce A.
    const payments = [{ patient_id: "B", amount: 1000 }];
    expect(computeClinicOutstandingBalance(treatments, payments)).toBe(1000);
  });

  it("includes OPD and X-ray charges, per patient", () => {
    const treatments = [
      {
        patient_id: "A",
        cost: 1000,
        status: "completed",
        opd_charged: true,
        opd_fee: 300,
        xray_taken: true,
        xray_cost: 500,
      },
    ];
    const payments = [{ patient_id: "A", amount: 400 }];
    // 1000 + 300 + 500 − 400 = 1400
    expect(computeClinicOutstandingBalance(treatments, payments)).toBe(1400);
  });

  it("equals the sum of each patient's own computeOutstandingBalance", () => {
    const treatments = [
      { patient_id: "A", cost: 1000, status: "completed", opd_charged: true, opd_fee: 300 },
      { patient_id: "A", cost: 800, status: "planned" },
      { patient_id: "B", cost: 2000, status: "in_progress", xray_taken: true, xray_cost: 500 },
    ];
    const payments = [
      { patient_id: "A", amount: 400 },
      { patient_id: "B", amount: 3000 }, // overpaid
    ];
    const byHand =
      computeOutstandingBalance(
        treatments.filter((t) => t.patient_id === "A"),
        payments.filter((p) => p.patient_id === "A"),
      ) +
      computeOutstandingBalance(
        treatments.filter((t) => t.patient_id === "B"),
        payments.filter((p) => p.patient_id === "B"),
      );
    expect(computeClinicOutstandingBalance(treatments, payments)).toBe(byHand);
    // A: 1000 + 300 − 400 = 900 ; B: max(0, 2500 − 3000) = 0 → 900
    expect(byHand).toBe(900);
  });

  it("a patient with payments but no treatments never reduces the total", () => {
    const treatments = [{ patient_id: "A", cost: 1000, status: "completed" }];
    const payments = [
      { patient_id: "A", amount: 200 },
      { patient_id: "Z", amount: 9999 }, // stranger sitting on a big credit
    ];
    expect(computeClinicOutstandingBalance(treatments, payments)).toBe(800);
  });
});
