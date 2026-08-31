/**
 * The one card a general-purpose PMS cannot produce: "this much chair time went
 * unused today, and here are the exact patients whose planned treatment would
 * have filled it."
 *
 * Saying it needs the appointment ledger and the treatment ledger in the same
 * system, which is the product argument for OraMedha being one thing rather than
 * two integrations. The engine already worked the relationship out — the
 * `unconverted_demand` hypothesis on `demand_supply_mismatch` — and the briefing
 * used to throw it away, splitting one finding across two cards that each told
 * half of it.
 *
 * The negative case matters as much as the positive one, and is the reason this
 * keys off the settled hypothesis rather than off the two constraints merely
 * co-occurring: idle chairs and an unbooked treatment book can both be true for
 * unrelated reasons, and asserting they are one problem would be exactly the
 * confident over-claim the rest of the pipeline refuses to make.
 */

import { describe, expect, it } from "vitest";

import { buildBriefing } from "../briefing-view";
import type {
  BusinessBrainResult,
  Constraint,
  Diagnosis,
  Metric,
  Value,
  Workflow,
} from "@/business-brain";

const CAPACITY_ID = "constraint.capacity:c1:2026-08-30";
const ACCEPTANCE_ID = "constraint.treatment_acceptance:c1:2026-08-30";

function constraint(id: string, category: string, severity = "high"): Constraint {
  return { id, name: category, description: "", category, severity } as unknown as Constraint;
}

function value(amount: number, unit: string): Value {
  return { id: `v-${unit}`, amount, unit } as unknown as Value;
}

/** A demand_supply_mismatch carrying `unconverted_demand` at the given status. */
function mismatch(status: "supported" | "contradicted" | "undetermined"): Diagnosis {
  return {
    id: "diagnosis.demand_supply_mismatch:c1:2026-08-30",
    pattern: "demand_supply_mismatch",
    hypotheses: [
      {
        id: "diagnosis.demand_supply_mismatch:c1:2026-08-30#h.unconverted_demand",
        status,
      },
    ],
  } as unknown as Diagnosis;
}

function workflow(constraintId: string, instruction: string): Workflow {
  return {
    constraintId,
    owner: "receptionist",
    tasks: [{ id: "t1", instruction }],
  } as unknown as Workflow;
}

function resultWith(diagnoses: Diagnosis[]): BusinessBrainResult {
  return {
    constraints: [constraint(CAPACITY_ID, "capacity"), constraint(ACCEPTANCE_ID, "treatment_acceptance")],
    diagnoses,
    valueAtStake: new Map([
      [CAPACITY_ID, [value(930, "minutes")]],
      [ACCEPTANCE_ID, [value(169_100, "currency")]],
    ]),
    workflows: [
      workflow(CAPACITY_ID, "Review why the chair was empty"),
      workflow(ACCEPTANCE_ID, "Pull the list of patients with planned treatment"),
    ],
  } as unknown as BusinessBrainResult;
}

const metrics: Metric[] = [
  { id: "treatment.accepted_pending_scheduling:c1:2026-08-30", value: 3 },
] as unknown as Metric[];

describe("idle chair + unbooked treatment, when the engine settled they are one story", () => {
  const view = buildBriefing(resultWith([mismatch("supported")]), metrics, {
    treatment_acceptance: 3,
  });

  it("shows one card, not two halves of the same finding", () => {
    expect(view.problems).toHaveLength(1);
    expect(view.actions).toHaveLength(1);
    expect(view.problems[0].id).toBe(CAPACITY_ID);
  });

  it("says the sentence — how much time was lost, and who could have filled it", () => {
    const summary = view.problems[0].summary;
    expect(summary).toContain("15 hr 30 min"); // 930 minutes, spoken
    expect(summary).toContain("3 patients with planned treatment");
    expect(summary).toContain("no next visit booked");
  });

  it("headlines the money on the books, not the idle minutes", () => {
    // The minutes are already in the summary; the unbooked treatment value is
    // what makes the case for acting on it today.
    expect(view.problems[0].atStake).toBe("₹1,69,100");
    expect(view.problems[0].atStakeLabel).toBe("in planned treatment, unbooked");
  });

  it("carries the steps that fill a chair, not the ones that explain an empty one", () => {
    const action = view.actions[0];
    expect(action.problemId).toBe(CAPACITY_ID);
    expect(action.checklist.map((c) => c.label)).toEqual([
      "Pull the list of patients with planned treatment",
    ]);
    // Contactable, and keyed so the WhatsApp population resolves to these patients.
    expect(action.messageKind).toBe("treatment_plan_follow_up");
    expect(action.primaryActions.map((a) => a.kind)).toContain("contact_patients");
  });
});

describe("the same two constraints, when the engine did NOT settle it", () => {
  it("keeps them separate when unconverted_demand is only undetermined", () => {
    const view = buildBriefing(resultWith([mismatch("undetermined")]), metrics);
    // Co-occurrence alone is not evidence they are one problem — a chair can sit
    // idle and a treatment book sit unbooked for entirely unrelated reasons.
    expect(view.problems).toHaveLength(2);
    expect(view.problems.map((p) => p.title)).not.toContain(
      "Your chair sat idle while patients were waiting to be booked",
    );
  });

  it("keeps them separate when unconverted_demand was contradicted", () => {
    const view = buildBriefing(resultWith([mismatch("contradicted")]), metrics);
    expect(view.problems).toHaveLength(2);
  });

  it("keeps them separate when there is no diagnosis at all", () => {
    const view = buildBriefing(resultWith([]), metrics);
    expect(view.problems).toHaveLength(2);
  });
});
