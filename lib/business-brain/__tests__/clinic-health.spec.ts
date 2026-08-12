/**
 * Specs for the Clinic Health Score.
 *
 * The score is the one number on the redesigned Morning Briefing, so it has to
 * be provably deterministic, provably itemised (never a lone figure), and
 * provably driven only by live facts — the three properties that answer the
 * original objection to having a score at all. These tests pin all three.
 */

import { describe, expect, it } from "vitest";

import type { Metric } from "@/business-brain";
import { computeClinicHealth } from "../clinic-health";

/** Build a metric whose id matches the "<key>:<clinic>:<date>" lookup prefix. */
function metric(key: string, value: number): Metric {
  return {
    id: `${key}:clinic-1:2026-08-06`,
    name: key,
    value,
    unit: "count",
    category: "operational",
    timestamp: "2026-08-06T06:30:00.000Z",
  };
}

describe("computeClinicHealth", () => {
  it("scores a clean clinic 100 with no deductions", () => {
    const health = computeClinicHealth([
      metric("revenue.outstanding", 0),
      metric("treatment.accepted_pending_scheduling", 0),
      metric("followups.overdue", 0),
      metric("scheduling.no_show_rate_30d", 5),
      metric("capacity.chair_utilization", 90),
      metric("queue.average_waiting_time", 10),
    ]);
    expect(health.score).toBe(100);
    expect(health.band).toBe("excellent");
    expect(health.bandLabel).toBe("Excellent");
    expect(health.deductions).toEqual([]);
  });

  it("scores an empty metric set 100 — nothing measured is nothing to deduct", () => {
    // A withheld metric is absent from the array; it must never be read as zero
    // and must never remove points.
    const health = computeClinicHealth([]);
    expect(health.score).toBe(100);
    expect(health.deductions).toEqual([]);
  });

  it("itemises every deduction — the score is never a lone number", () => {
    const health = computeClinicHealth([
      metric("revenue.outstanding", 30000), // -12
      metric("followups.overdue", 2), // -6
    ]);
    expect(health.score).toBe(82);
    expect(health.deductions).toHaveLength(2);
    // Sorted worst-first.
    expect(health.deductions[0].factor).toBe("Unpaid balances");
    expect(health.deductions[0].points).toBe(12);
    expect(health.deductions[1].factor).toBe("Overdue recalls");
    expect(health.deductions[1].points).toBe(6);
    // The breakdown always reconstructs the score.
    const removed = health.deductions.reduce((s, d) => s + d.points, 0);
    expect(100 - removed).toBe(health.score);
  });

  describe("outstanding balance is banded by size", () => {
    const at = (v: number) =>
      computeClinicHealth([metric("revenue.outstanding", v)]).deductions[0]?.points ?? 0;
    it("removes 18 at ₹50k+, 12 at ₹25k+, 6 at ₹10k+, 2 above zero, 0 at zero", () => {
      expect(at(60000)).toBe(18);
      expect(at(30000)).toBe(12);
      expect(at(12000)).toBe(6);
      expect(at(500)).toBe(2);
      expect(at(0)).toBe(0);
    });
  });

  describe("per-item factors are capped", () => {
    it("caps overdue recalls at 15 points however many there are", () => {
      const many = computeClinicHealth([metric("followups.overdue", 20)]);
      expect(many.deductions[0].points).toBe(15);
    });
    it("caps no-next-visit at 15 points", () => {
      const many = computeClinicHealth([metric("treatment.accepted_pending_scheduling", 40)]);
      expect(many.deductions[0].points).toBe(15);
    });
  });

  describe("rate and today factors have thresholds", () => {
    it("ignores a no-show rate at or below 10%, escalates above it", () => {
      expect(computeClinicHealth([metric("scheduling.no_show_rate_30d", 10)]).deductions).toEqual([]);
      expect(computeClinicHealth([metric("scheduling.no_show_rate_30d", 15)]).deductions[0].points).toBe(4);
      expect(computeClinicHealth([metric("scheduling.no_show_rate_30d", 25)]).deductions[0].points).toBe(8);
      expect(computeClinicHealth([metric("scheduling.no_show_rate_30d", 40)]).deductions[0].points).toBe(12);
    });
    it("ignores healthy chair use, escalates as it falls", () => {
      expect(computeClinicHealth([metric("capacity.chair_utilization", 80)]).deductions).toEqual([]);
      expect(computeClinicHealth([metric("capacity.chair_utilization", 60)]).deductions[0].points).toBe(2);
      expect(computeClinicHealth([metric("capacity.chair_utilization", 40)]).deductions[0].points).toBe(5);
      expect(computeClinicHealth([metric("capacity.chair_utilization", 20)]).deductions[0].points).toBe(8);
    });
    it("ignores short waits, escalates long ones", () => {
      expect(computeClinicHealth([metric("queue.average_waiting_time", 25)]).deductions).toEqual([]);
      expect(computeClinicHealth([metric("queue.average_waiting_time", 35)]).deductions[0].points).toBe(3);
      expect(computeClinicHealth([metric("queue.average_waiting_time", 50)]).deductions[0].points).toBe(6);
    });
  });

  describe("bands align with the brief's examples", () => {
    const scoreWith = (removedTarget: number) => {
      // Build outstanding-balance-only deductions to hit rough score bands.
      return computeClinicHealth([metric("revenue.outstanding", removedTarget)]).band;
    };
    it("labels a worst-case clinic Urgent but never below zero", () => {
      const worst = computeClinicHealth([
        metric("revenue.outstanding", 90000), // -18
        metric("treatment.accepted_pending_scheduling", 10), // -15
        metric("followups.overdue", 10), // -15
        metric("scheduling.no_show_rate_30d", 40), // -12
        metric("capacity.chair_utilization", 10), // -8
        metric("queue.average_waiting_time", 60), // -6
      ]);
      expect(worst.score).toBe(26); // 100 - 74
      expect(worst.band).toBe("urgent");
      expect(worst.bandLabel).toBe("Urgent");
    });
    it("puts a clinic with only a small balance in the top bands", () => {
      expect(scoreWith(500)).toBe("excellent"); // 98
    });
    it("crosses into Needs Attention and Good at the documented cutoffs", () => {
      // 100 - 45 = 55 → attention (>=55); 100 - 30 = 70 → good (>=70)
      const attention = computeClinicHealth([
        metric("revenue.outstanding", 90000), // -18
        metric("followups.overdue", 5), // -15
        metric("scheduling.no_show_rate_30d", 40), // -12
      ]);
      expect(attention.score).toBe(55);
      expect(attention.band).toBe("attention");

      const good = computeClinicHealth([
        metric("revenue.outstanding", 90000), // -18
        metric("followups.overdue", 4), // -12
      ]);
      expect(good.score).toBe(70);
      expect(good.band).toBe("good");
    });
  });

  it("is deterministic — same metrics, byte-identical result", () => {
    const build = () =>
      computeClinicHealth([
        metric("revenue.outstanding", 30000),
        metric("followups.overdue", 3),
        metric("capacity.chair_utilization", 45),
      ]);
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it("clamps to zero and never negative on an extreme balance", () => {
    // Even the largest single factor can't push the score out of range, and the
    // whole-clinic worst case is already floored above zero by the caps.
    const health = computeClinicHealth([metric("revenue.outstanding", 9999999)]);
    expect(health.score).toBe(82); // only 18 removed; caps prevent a runaway
    expect(health.score).toBeGreaterThanOrEqual(0);
  });

  it("prefers the distinct-patient count over the row metric for patient-worded factors", () => {
    // The metric counts treatment/follow-up ROWS (5 and 4 here); the page supplies
    // the deduped patient counts (2 and 3). The breakdown must state the patient
    // counts so it agrees with the problem cards and the action list.
    const metrics = [
      metric("treatment.accepted_pending_scheduling", 5),
      metric("followups.overdue", 4),
    ];
    const health = computeClinicHealth(metrics, {
      patientCounts: { noNextVisit: 2, overdueFollowups: 3 },
    });
    const noVisit = health.deductions.find((d) => d.factor === "No next visit booked");
    const overdue = health.deductions.find((d) => d.factor === "Overdue recalls");
    expect(noVisit?.detail).toBe("2 patients have planned treatment but no next appointment");
    expect(noVisit?.points).toBe(6); // 2 patients × 3, not 5 rows × 3
    expect(overdue?.detail).toBe("3 patients overdue for a check-up reminder");
    expect(overdue?.points).toBe(9); // 3 patients × 3, not 4 rows × 3
  });

  it("falls back to the row metric when no patient count is supplied", () => {
    // Backward-compatible: with no override the factor reads the metric as before.
    const health = computeClinicHealth([metric("followups.overdue", 3)]);
    const overdue = health.deductions.find((d) => d.factor === "Overdue recalls");
    expect(overdue?.detail).toBe("3 patients overdue for a check-up reminder");
    expect(overdue?.points).toBe(9);
  });
});
