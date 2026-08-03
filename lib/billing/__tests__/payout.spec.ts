/**
 * Specs for consultant payouts earned from money actually collected.
 *
 * The reported bug: a ₹10,000 treatment with a 40% consultant booked a ₹4,000
 * payout the instant it was recorded. If the patient paid ₹3,000 the payout
 * should have been ₹1,200, and if they never returned it should have been
 * nothing at all — but the clinic had already committed the full amount.
 *
 * The scenarios the clinic asked to see verified are each covered below:
 * partial payments, multiple payments, multiple visits, outstanding balances,
 * payment edits, and historical appointments. Refunds are noted at the end —
 * the schema cannot represent one.
 */

import { describe, expect, it } from "vitest";

import {
  allocateCollectionsToTreatments,
  consultantEntitlement,
  earnedConsultantShare,
  sumEarnedConsultantPayouts,
  sumUnearnedConsultantPayouts,
} from "../payout";

/** A ₹10,000 treatment with a 40% consultant → ₹4,000 entitlement. */
const treatment = (over: Partial<Parameters<typeof earnedConsultantShare>[0]> = {}) => ({
  id: "t1",
  cost: 10000,
  status: "completed",
  consultant_id: "c1",
  consultant_share: 4000,
  performed_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("the reported case", () => {
  it("pays 40% of what was collected, not 40% of what was billed", () => {
    const t = treatment();
    expect(consultantEntitlement(t)).toBe(4000);
    expect(sumEarnedConsultantPayouts([t], [{ amount: 3000 }])).toBe(1200);
  });

  it("pays nothing when the patient never paid", () => {
    // The whole point: an unpaid treatment must not commit the clinic to a payout.
    expect(sumEarnedConsultantPayouts([treatment()], [])).toBe(0);
  });

  it("pays the full entitlement once the treatment is settled", () => {
    expect(sumEarnedConsultantPayouts([treatment()], [{ amount: 10000 }])).toBe(4000);
  });

  it("never pays more than the entitlement, however much is collected", () => {
    expect(sumEarnedConsultantPayouts([treatment()], [{ amount: 999999 }])).toBe(4000);
  });

  it("reports the remainder as owed-but-not-yet-earned", () => {
    // What the clinic is on the hook for WITHOUT booking it as a cost today.
    expect(sumUnearnedConsultantPayouts([treatment()], [{ amount: 3000 }])).toBe(2800);
  });
});

describe("payment shapes", () => {
  it("accumulates multiple partial payments", () => {
    const payments = [{ amount: 1000 }, { amount: 1500 }, { amount: 500 }];
    expect(sumEarnedConsultantPayouts([treatment()], payments)).toBe(1200);
  });

  it("credits a payment linked to its own treatment", () => {
    const t = treatment();
    expect(sumEarnedConsultantPayouts([t], [{ amount: 3000, treatment_id: "t1" }])).toBe(1200);
  });

  it("ignores a zero-amount payment", () => {
    expect(sumEarnedConsultantPayouts([treatment()], [{ amount: 0 }])).toBe(0);
  });

  it("recomputes from scratch, so an edited or deleted payment needs no reconciliation", () => {
    const t = treatment();
    // Payment edited down from 3,000 to 1,000 — caller simply passes the new set.
    expect(sumEarnedConsultantPayouts([t], [{ amount: 3000 }])).toBe(1200);
    expect(sumEarnedConsultantPayouts([t], [{ amount: 1000 }])).toBe(400);
    // Payment soft-deleted entirely.
    expect(sumEarnedConsultantPayouts([t], [])).toBe(0);
  });
});

describe("no consultant involved", () => {
  it("earns nothing when the treatment has no consultant", () => {
    const t = treatment({ consultant_id: null, consultant_share: 0 });
    expect(sumEarnedConsultantPayouts([t], [{ amount: 10000 }])).toBe(0);
  });

  it("earns nothing on a treatment that is not billable", () => {
    // A planned treatment puts no cost on the bill, so no payout can accrue.
    const t = treatment({ status: "planned" });
    expect(sumEarnedConsultantPayouts([t], [{ amount: 10000 }])).toBe(0);
  });
});

describe("ancillary charges settle before treatment cost", () => {
  it("earns nothing when the payment only covers the consultation fee", () => {
    // The consultant's share was computed from `cost`; they have no claim on
    // the OPD fee, so a payment that only covers it must not trigger a payout.
    const t = treatment({ opd_charged: true, opd_fee: 300 });
    expect(earnedConsultantShare(t, 300)).toBe(0);
  });

  it("earns nothing when the payment only covers the X-ray", () => {
    const t = treatment({ xray_taken: true, xray_cost: 400 });
    expect(earnedConsultantShare(t, 400)).toBe(0);
  });

  it("earns on the remainder once the ancillaries are covered", () => {
    // ₹300 OPD + ₹400 X-ray settled first; ₹3,000 of cost collected → 40% of 30%.
    const t = treatment({
      opd_charged: true,
      opd_fee: 300,
      xray_taken: true,
      xray_cost: 400,
    });
    expect(earnedConsultantShare(t, 3700)).toBe(1200);
  });

  it("still reaches the full entitlement when the whole bill is paid", () => {
    const t = treatment({ opd_charged: true, opd_fee: 300 });
    expect(sumEarnedConsultantPayouts([t], [{ amount: 10300 }])).toBe(4000);
  });
});

describe("multiple treatments and visits", () => {
  const older = {
    id: "old",
    cost: 5000,
    status: "completed",
    consultant_id: "c1",
    consultant_share: 2000, // 40%
    performed_at: "2026-01-01T00:00:00Z",
  };
  const newer = {
    id: "new",
    cost: 10000,
    status: "completed",
    consultant_id: "c1",
    consultant_share: 4000, // 40%
    performed_at: "2026-06-01T00:00:00Z",
  };

  it("applies an unlinked payment to the oldest treatment first", () => {
    // ₹5,000 settles the older treatment completely and nothing else.
    const collected = allocateCollectionsToTreatments([newer, older], [{ amount: 5000 }]);
    expect(collected.get("old")).toBe(5000);
    expect(collected.get("new")).toBe(0);
    expect(sumEarnedConsultantPayouts([newer, older], [{ amount: 5000 }])).toBe(2000);
  });

  it("spills past the oldest treatment once it is settled", () => {
    // ₹8,000: ₹5,000 clears the old one, ₹3,000 lands on the new one.
    const collected = allocateCollectionsToTreatments([older, newer], [{ amount: 8000 }]);
    expect(collected.get("old")).toBe(5000);
    expect(collected.get("new")).toBe(3000);
    // 2,000 earned in full + 40% of 3,000.
    expect(sumEarnedConsultantPayouts([older, newer], [{ amount: 8000 }])).toBe(3200);
  });

  it("honours an explicit treatment link ahead of oldest-first ordering", () => {
    // Payment earmarked for the NEWER treatment must not drift to the older one.
    const collected = allocateCollectionsToTreatments(
      [older, newer],
      [{ amount: 3000, treatment_id: "new" }],
    );
    expect(collected.get("old")).toBe(0);
    expect(collected.get("new")).toBe(3000);
  });

  it("spills an oversized linked payment into the pool rather than one line item", () => {
    // ₹9,000 earmarked for a ₹5,000 treatment: ₹5,000 sticks, ₹4,000 moves on.
    const collected = allocateCollectionsToTreatments(
      [older, newer],
      [{ amount: 9000, treatment_id: "old" }],
    );
    expect(collected.get("old")).toBe(5000);
    expect(collected.get("new")).toBe(4000);
  });

  it("caps total collection at what was actually billed", () => {
    const collected = allocateCollectionsToTreatments([older, newer], [{ amount: 999999 }]);
    expect(collected.get("old")! + collected.get("new")!).toBe(15000);
  });

  it("is deterministic for treatments recorded at the same instant", () => {
    // Two runs must split a pooled payment identically, or the same data would
    // report different payouts on consecutive page loads.
    const a = { ...older, id: "a", performed_at: "2026-01-01T00:00:00Z" };
    const b = { ...older, id: "b", performed_at: "2026-01-01T00:00:00Z" };
    const first = allocateCollectionsToTreatments([a, b], [{ amount: 6000 }]);
    const second = allocateCollectionsToTreatments([b, a], [{ amount: 6000 }]);
    expect(first.get("a")).toBe(second.get("a"));
    expect(first.get("b")).toBe(second.get("b"));
  });
});

describe("historical data", () => {
  it("credits legacy payments that carry no treatment link", () => {
    // payments.treatment_id only arrived in migration 20260713000000. Every
    // older payment is unlinked, and without pool allocation every historical
    // payout would silently collapse to zero.
    const t = treatment();
    expect(sumEarnedConsultantPayouts([t], [{ amount: 3000, treatment_id: null }])).toBe(1200);
  });

  it("pools a payment linked to a treatment outside the set", () => {
    // e.g. the linked treatment was soft-deleted; the money was still received.
    const t = treatment();
    expect(sumEarnedConsultantPayouts([t], [{ amount: 3000, treatment_id: "gone" }])).toBe(1200);
  });

  it("orders by created_at when performed_at was never recorded", () => {
    const a = {
      id: "a",
      cost: 5000,
      status: "completed",
      consultant_id: "c1",
      consultant_share: 2000,
      performed_at: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    const b = { ...a, id: "b", created_at: "2026-09-01T00:00:00Z" };
    const collected = allocateCollectionsToTreatments([b, a], [{ amount: 5000 }]);
    expect(collected.get("a")).toBe(5000);
    expect(collected.get("b")).toBe(0);
  });
});

describe("fixed-amount commission", () => {
  it("earns a fixed commission proportionally to collection", () => {
    // consultant_share is stored, so the split type is already baked in; a
    // ₹2,000 fixed fee on a ₹10,000 treatment earns 30% of ₹2,000 at ₹3,000 paid.
    const t = treatment({ consultant_share: 2000 });
    expect(sumEarnedConsultantPayouts([t], [{ amount: 3000 }])).toBe(600);
  });
});

describe("rounding", () => {
  it("returns currency-rounded payouts", () => {
    // ₹1,000 of a ₹3,000 treatment at a 1/3 share — no floating-point tails.
    const t = treatment({ cost: 3000, consultant_share: 1000 });
    expect(sumEarnedConsultantPayouts([t], [{ amount: 1000 }])).toBe(333.33);
  });
});

describe("range differencing (how analytics scopes a payout to a date range)", () => {
  // getAnalyticsSummary reports the payout EARNED DURING a range as
  //   earned(payments through range end) - earned(payments before range start).
  // These specs pin the two properties that make that valid.
  const t = treatment();
  const payments = [
    { amount: 2000, payment_date: "2026-01-10" },
    { amount: 3000, payment_date: "2026-02-15" },
    { amount: 5000, payment_date: "2026-03-20" },
  ];
  const through = (end: string) => payments.filter((p) => p.payment_date <= end);
  const before = (start: string) => payments.filter((p) => p.payment_date < start);
  const earnedIn = (start: string, end: string) =>
    sumEarnedConsultantPayouts([t], through(end)) - sumEarnedConsultantPayouts([t], before(start));

  it("never decreases as more payments arrive, so a range is never negative", () => {
    const jan = sumEarnedConsultantPayouts([t], through("2026-01-31"));
    const feb = sumEarnedConsultantPayouts([t], through("2026-02-28"));
    const mar = sumEarnedConsultantPayouts([t], through("2026-03-31"));
    expect(jan).toBe(800); // 40% of 2,000
    expect(feb).toBeGreaterThanOrEqual(jan);
    expect(mar).toBeGreaterThanOrEqual(feb);
    expect(mar).toBe(4000); // fully settled
  });

  it("splits a payment into exactly one range — consecutive ranges sum to the whole", () => {
    const jan = earnedIn("2026-01-01", "2026-01-31");
    const feb = earnedIn("2026-02-01", "2026-02-28");
    const mar = earnedIn("2026-03-01", "2026-03-31");
    expect(jan).toBe(800); // 40% of 2,000
    expect(feb).toBe(1200); // 40% of 3,000
    expect(mar).toBe(2000); // 40% of 5,000
    expect(jan + feb + mar).toBe(4000);
  });
});
