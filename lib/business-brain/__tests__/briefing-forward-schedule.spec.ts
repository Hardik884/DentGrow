/**
 * The forward-schedule warning, end to end.
 *
 * `capacity.booked_next_7d` was computed correctly for a long time and read by
 * nothing — the only forward-looking measurement in the system, reaching no
 * dentist. This pins the whole chain that now carries it to the screen:
 *
 *   metric -> signal -> diagnosis -> constraint -> value -> strategy
 *          -> workflow -> action plan -> problem card
 *
 * It runs the REAL engines rather than asserting each link in isolation,
 * because every individual piece passed its own tests while the metric was still
 * orphaned. Only composing them proves a dentist actually sees it.
 *
 * The other thing this guards is the reason the finding got its own constraint
 * category instead of joining CAPACITY: a thin week must never be described with
 * today's words or sized with today's idle minutes.
 */

import { describe, expect, it } from "vitest";

// The same internal engine entry points the orchestrator itself composes; the
// public barrel deliberately exposes only the service, not the stages.
import { deriveConstraints } from "@/business-brain/engines/constraint";
import { deriveValues } from "@/business-brain/engines/value";
import { proposeStrategies } from "@/business-brain/engines/strategy";
import { generateWorkflows } from "@/business-brain/engines/workflow";
import { generateActions } from "@/business-brain/engines/action";
import { diagnoseRun } from "@/business-brain/engines/diagnosis/__tests__/fixtures/diagnose-harness";
import {
  CLINIC_ID,
  DATE,
  FORWARD_SCHEDULE_GAP,
  HEALTHY,
  NOW,
  metrics,
  run,
} from "@/business-brain/engines/diagnosis/__tests__/fixtures/run-fixtures";
import { buildBriefing } from "../briefing-view";

/** Compose the deterministic pipeline the way the service does. */
function briefingFor(values: Parameters<typeof metrics>[0]) {
  const current = metrics(values);
  const diagnoses = diagnoseRun(run(values)).diagnoses;
  const { constraints } = deriveConstraints(diagnoses, CLINIC_ID, DATE, NOW);
  const valued = deriveValues(constraints, current, NOW);
  const { strategies } = proposeStrategies(
    constraints,
    diagnoses,
    CLINIC_ID,
    DATE,
    NOW,
    valued.byConstraint,
  );
  const { workflows } = generateWorkflows(strategies, constraints, CLINIC_ID, DATE, NOW);
  const { plans } = generateActions(workflows, CLINIC_ID, DATE, NOW);
  const view = buildBriefing(
    {
      constraints,
      valueAtStake: valued.byConstraint,
      workflows,
    } as unknown as Parameters<typeof buildBriefing>[0],
    current,
  );
  return { diagnoses, constraints, strategies, workflows, plans, view };
}

describe("the forward-schedule warning reaches the dentist", () => {
  it("turns a thin week ahead into a problem card with a real percentage", () => {
    const { view } = briefingFor(FORWARD_SCHEDULE_GAP);

    const problem = view.problems.find((p) => p.id.includes("forward_schedule"));
    expect(problem, "a thin week ahead produced no problem card").toBeDefined();
    expect(problem?.title).toBe("Next week is filling up slowly");
    // The fixture books 18% of next week, and the card must say so — the number
    // is the whole reason this is actionable rather than a vague warning.
    expect(problem?.summary).toBe("Only 18% of next week's chair time is booked.");
  });

  it("states no money or minutes at stake, because neither is measured", () => {
    const { view } = briefingFor(FORWARD_SCHEDULE_GAP);
    const problem = view.problems.find((p) => p.id.includes("forward_schedule"));

    // Nothing measures the chair-minutes the coming week offers, so the card
    // shows no headline figure at all. A zero here would read as "nothing at
    // stake"; today's idle minutes would be the CAPACITY answer to a different
    // question. Absent is the only honest option.
    expect(problem?.atStake).toBeNull();
    expect(problem?.atStakeLabel).toBeNull();
  });

  it("describes the week ahead, never the day just gone", () => {
    const { view } = briefingFor(FORWARD_SCHEDULE_GAP);
    const problem = view.problems.find((p) => p.id.includes("forward_schedule"));

    // The regression this exists to catch: folding the finding into CAPACITY
    // would hand it "Your chair was empty today" as its explanation.
    expect(problem?.title).not.toContain("today");
    expect(problem?.explanation).not.toContain("today");
    expect(problem?.summary).not.toContain("today");
  });

  it("gives it an action card with a booking action and real steps", () => {
    const { view, plans } = briefingFor(FORWARD_SCHEDULE_GAP);

    const action = view.actions.find((a) => a.category === "forward_schedule");
    expect(action, "the problem card has no paired action").toBeDefined();
    expect(action?.title).toBe("Fill next week's open slots");
    expect(action?.primaryActions.map((a) => a.kind)).toEqual(["book_appointment"]);
    // A checklist means a workflow was actually derived, not an empty shell.
    expect(action?.checklist.length).toBeGreaterThan(0);

    // And the Action Engine prepared a plan for it, so the last stage is wired.
    expect(plans.some((p) => p.workflowKey === "forward_schedule_gap")).toBe(true);
  });

  it("settles the cause, so the advice is corrective rather than investigative", () => {
    const { strategies } = briefingFor(FORWARD_SCHEDULE_GAP);
    const forward = strategies.filter((s) => s.constraintId.includes("forward_schedule"));

    expect(forward.length).toBeGreaterThan(0);
    // The occupancy percentage measures the gap directly, so there is nothing
    // left to go and find out. A clinic told to "investigate" a number the
    // engine already has would be the playbook drifting from the matchers.
    expect(forward.every((s) => s.kind === "corrective")).toBe(true);
  });

  it("addresses the dentist reading it, never a role that cannot open the page", () => {
    const { view, workflows } = briefingFor(FORWARD_SCHEDULE_GAP);
    const action = view.actions.find((a) => a.category === "forward_schedule");

    // The regression: every card used to be stamped "Front desk", which claimed a
    // role with no access to this page was on top of the work. The page is
    // dentist-only, so the chip has to speak to the dentist.
    expect(action?.ownerLabel).not.toBe("Front desk");

    // Filling next week is front-desk work, so the dentist is told to hand it
    // over rather than that someone else already has it.
    expect(workflows.find((w) => w.templateKey === "forward_schedule_gap")?.owner).toBe(
      "receptionist",
    );
    expect(action?.ownerLabel).toBe("Delegate");
  });

  it("stays silent when the week ahead is healthy", () => {
    const { view } = briefingFor(HEALTHY);
    expect(view.problems.some((p) => p.id.includes("forward_schedule"))).toBe(false);
  });

  it("does not fire on a today-problem, and a today-problem does not fire on it", () => {
    // A thin week with a perfectly normal day must raise the forward finding and
    // nothing else — proof the two tenses are genuinely separate constraints
    // rather than one card wearing two hats.
    const { constraints } = briefingFor(FORWARD_SCHEDULE_GAP);
    expect(constraints.map((c) => c.category)).toEqual(["forward_schedule"]);
  });
});
