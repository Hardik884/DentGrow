/**
 * Regression: the retention problem card's headline number must name the SAME
 * population as its summary line and the "Open overdue recalls" action list —
 * distinct patients with an overdue follow-up — not the reactivation-candidate
 * figure the Value Engine uses to size and rank the constraint (audit A9).
 *
 * buildBriefing is pure, so this pins the projection directly without the engine.
 */

import { describe, expect, it } from "vitest";

import { buildBriefing } from "../briefing-view";
import type { BusinessBrainResult, Constraint, Metric, Value } from "@/business-brain";

/** A result carrying a retention constraint sized by reactivation candidates. */
function retentionResult(reactivationAmount: number): BusinessBrainResult {
  const constraint = {
    id: "c-ret",
    name: "Retention",
    description: "Patients have stopped coming back",
    category: "retention",
    severity: "high",
    identifiedAt: "2026-08-12T00:00:00.000Z",
  } as unknown as Constraint;

  const value = {
    id: "v-ret",
    type: "retention_improved",
    amount: reactivationAmount, // lapsed-roster reactivation candidates — the WRONG population
    unit: "count",
    measuredAt: "2026-08-12T00:00:00.000Z",
  } as unknown as Value;

  return {
    constraints: [constraint],
    valueAtStake: new Map([[constraint.id, [value]]]),
    workflows: [],
  } as unknown as BusinessBrainResult;
}

const overdueMetric = (n: number): Metric[] =>
  [{ id: "followups.overdue:2026-08-12", value: n }] as unknown as Metric[];

describe("retention briefing headline (audit A9)", () => {
  it("shows the overdue-follow-up patient count, not the reactivation-candidate value", () => {
    // 30 lapsed reactivation candidates, but only 4 distinct overdue-recall patients.
    const view = buildBriefing(retentionResult(30), overdueMetric(4), { retention: 4 });
    const problem = view.problems.find((p) => p.id === "c-ret");
    expect(problem?.atStake).toBe("4"); // reconciles with the recall list
    expect(problem?.atStake).not.toBe("30"); // NOT the reactivation figure
    expect(problem?.atStakeLabel).toBe("patients overdue");
    expect(problem?.summary).toBe("4 patients have a follow-up due.");
  });

  it("falls back to the followups.overdue metric when no distinct count is supplied", () => {
    const view = buildBriefing(retentionResult(30), overdueMetric(6));
    const problem = view.problems.find((p) => p.id === "c-ret");
    expect(problem?.atStake).toBe("6");
  });

  it("shows no headline number when there are no overdue recalls", () => {
    // Retention flagged for another reason (e.g. returning-volume drop): with no
    // overdue follow-ups there is no recall list, so no mismatched number appears.
    const view = buildBriefing(retentionResult(30), overdueMetric(0));
    const problem = view.problems.find((p) => p.id === "c-ret");
    expect(problem?.atStake).toBeNull();
  });
});
