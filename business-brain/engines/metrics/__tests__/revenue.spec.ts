import { describe, expect, it } from "vitest";

import {
  BILLABLE_TREATMENT_STATUSES,
  outstandingPayments,
  pendingTreatmentValue,
  revenueCollectedToday,
} from "../calculators/revenue-metrics";
import { DATE, payment, snapshot, treatment, valueOf } from "./fixtures/snapshot-fixtures";

describe("revenueCollectedToday", () => {
  it("sums only payments recorded on the target date", () => {
    const s = snapshot({
      payments: [
        payment({ amount: 1500, paymentDate: DATE }),
        payment({ amount: 500, paymentDate: DATE }),
        payment({ amount: 9999, paymentDate: "2026-07-27" }),
        payment({ amount: 9999, paymentDate: "2026-07-29" }),
      ],
    });
    expect(valueOf(revenueCollectedToday, s)).toBe(2000);
  });

  it("reports zero for a day with no payments", () => {
    expect(valueOf(revenueCollectedToday, snapshot())).toBe(0);
  });
});

describe("outstandingPayments", () => {
  it("counts only billable statuses, matching lib/billing/balance.ts", () => {
    expect(BILLABLE_TREATMENT_STATUSES).toEqual(["completed", "in_progress"]);
  });

  it("EXCLUDES planned treatments — accepted work is not yet owed", () => {
    const s = snapshot({
      treatments: [
        treatment({ cost: 5000, status: "completed" }),
        treatment({ cost: 3000, status: "planned" }),
      ],
      payments: [],
    });
    // 5000 billable; the 3000 planned treatment must not appear in dues.
    expect(valueOf(outstandingPayments, s)).toBe(5000);
  });

  it("includes in_progress treatments", () => {
    const s = snapshot({
      treatments: [treatment({ cost: 2000, status: "in_progress" })],
    });
    expect(valueOf(outstandingPayments, s)).toBe(2000);
  });

  it("excludes cancelled treatments", () => {
    const s = snapshot({
      treatments: [
        treatment({ cost: 4000, status: "completed" }),
        treatment({ cost: 8000, status: "cancelled" }),
      ],
    });
    expect(valueOf(outstandingPayments, s)).toBe(4000);
  });

  it("subtracts all payments regardless of date", () => {
    const s = snapshot({
      treatments: [treatment({ cost: 5000, status: "completed" })],
      payments: [
        payment({ amount: 2000, paymentDate: "2026-01-01" }),
        payment({ amount: 1000, paymentDate: DATE }),
      ],
    });
    expect(valueOf(outstandingPayments, s)).toBe(2000);
  });

  it("floors at zero so an overpayment never reads as negative dues", () => {
    const s = snapshot({
      treatments: [treatment({ cost: 1000, status: "completed" })],
      payments: [payment({ amount: 4000 })],
    });
    expect(valueOf(outstandingPayments, s)).toBe(0);
  });

  it("does not double-count planned work against pendingTreatmentValue", () => {
    // The same planned treatment must appear in exactly one of the two metrics.
    const s = snapshot({
      treatments: [treatment({ cost: 7000, status: "planned" })],
    });
    expect(valueOf(outstandingPayments, s)).toBe(0);
    expect(valueOf(pendingTreatmentValue, s)).toBe(7000);
  });
});

describe("pendingTreatmentValue", () => {
  it("sums planned and in_progress treatments only", () => {
    const s = snapshot({
      treatments: [
        treatment({ cost: 1000, status: "planned" }),
        treatment({ cost: 2000, status: "in_progress" }),
        treatment({ cost: 4000, status: "completed" }),
        treatment({ cost: 8000, status: "cancelled" }),
      ],
    });
    expect(valueOf(pendingTreatmentValue, s)).toBe(3000);
  });

  it("uses gross cost, not the clinic's share", () => {
    const s = snapshot({
      treatments: [treatment({ cost: 1000, status: "planned" })],
    });
    expect(valueOf(pendingTreatmentValue, s)).toBe(1000);
  });
});

