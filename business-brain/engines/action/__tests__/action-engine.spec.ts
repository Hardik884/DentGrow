/**
 * Action Engine behaviour.
 *
 * Three things this suite is really protecting:
 *
 * 1. The engine PREPARES and never PERFORMS. Every action must be in-app and
 *    prepare-only, and every draft must be marked as a draft. This is the
 *    guarantee the whole feature rests on, so it is asserted over every action
 *    the engine can produce, not over a sample.
 *
 * 2. The engine makes no business judgement. Priority, owner and timeframe are
 *    copied off the workflow. A test that changes only the workflow's priority
 *    and expects it to appear on every action is what stops someone quietly
 *    adding a rule that "escalates" a category.
 *
 * 3. It is deterministic. Same inputs, byte-identical output.
 */

import { describe, expect, it } from "vitest";

import { generateActions } from "../action-engine";
import { ACTION_CATALOG, CATALOG_IDS } from "../action-catalog";
import { ACTION_PLANS } from "../action-plans";
import { actionDateWindows } from "../action-dates";
import { WORKFLOW_TEMPLATE_KEYS } from "../../workflow";
import { WorkflowOwner, WorkflowTimeframe } from "../../../domain";
import { Priority } from "../../../types";
import { CLINIC, DATE, NOW, workflowFor } from "./fixtures";

/** Every action the engine can produce, across every workflow template. */
function everyAction() {
  const workflows = WORKFLOW_TEMPLATE_KEYS.map((key) => workflowFor(key));
  return generateActions(workflows, CLINIC, DATE, NOW).plans.flatMap((p) => p.actions);
}

describe("Action Engine — prepares work, never performs it", () => {
  it("emits every action as in-app and prepare-only", () => {
    const offenders = everyAction()
      .filter((a) => a.delivery.channel !== "in_app" || a.delivery.execution !== "prepare_only")
      .map((a) => `${a.id} (${a.delivery.channel}/${a.delivery.execution})`);

    expect(
      offenders,
      `these actions claim to execute rather than prepare: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("marks every prepared message as a draft", () => {
    const drafts = everyAction()
      .map((a) => a.draft)
      .filter((d): d is NonNullable<typeof d> => d !== undefined);

    expect(drafts.length).toBeGreaterThan(0);
    for (const draft of drafts) {
      expect(draft.state).toBe("draft");
    }
  });

  it("gives every draft a body and declares each placeholder it contains", () => {
    for (const action of everyAction()) {
      const draft = action.draft;
      if (draft === undefined) continue;

      expect(draft.body.length).toBeGreaterThan(0);

      const inText = new Set(
        [...`${draft.subject ?? ""} ${draft.body}`.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]),
      );
      expect(new Set(draft.placeholders), `placeholders drift in ${action.id}`).toEqual(inText);
    }
  });

  it("attaches a draft only to draft actions", () => {
    for (const action of everyAction()) {
      if (action.draft !== undefined) expect(action.kind).toBe("prepare_draft");
      if (action.kind === "prepare_draft") expect(action.draft).toBeDefined();
    }
  });
});

describe("Action Engine — makes no business judgement", () => {
  it("copies priority off the workflow rather than deciding one", () => {
    for (const priority of [Priority.LOW, Priority.CRITICAL]) {
      const { plans } = generateActions(
        [workflowFor("retention_driven", { priority })],
        CLINIC,
        DATE,
        NOW,
      );
      expect(plans[0].priority).toBe(priority);
      for (const action of plans[0].actions) expect(action.priority).toBe(priority);
    }
  });

  it("copies owner and timeframe off the workflow", () => {
    const { plans } = generateActions(
      [
        workflowFor("patient_balances", {
          owner: WorkflowOwner.EITHER,
          timeframe: WorkflowTimeframe.SOON,
        }),
      ],
      CLINIC,
      DATE,
      NOW,
    );

    expect(plans[0].owner).toBe(WorkflowOwner.EITHER);
    expect(plans[0].timeframe).toBe(WorkflowTimeframe.SOON);
    // Actions inherit unless the capability is role-bound.
    const inherited = plans[0].actions.filter(
      (a) => ACTION_CATALOG.get(a.capability)?.owner === undefined,
    );
    expect(inherited.length).toBeGreaterThan(0);
    for (const action of inherited) expect(action.owner).toBe(WorkflowOwner.EITHER);
  });

  it("keeps a clinic-wide setting with the dentist whoever owns the workflow", () => {
    const { plans } = generateActions(
      [workflowFor("capacity_not_offered", { owner: WorkflowOwner.RECEPTIONIST })],
      CLINIC,
      DATE,
      NOW,
    );
    const settings = plans[0].actions.find((a) => a.capability === "open_availability_settings");
    expect(settings?.owner).toBe(WorkflowOwner.DENTIST);
  });

  it("preserves the Workflow Engine's ordering instead of re-ranking", () => {
    const workflows = [
      workflowFor("yield", { priority: Priority.LOW }),
      workflowFor("patient_balances", { priority: Priority.CRITICAL }),
    ];
    const { plans } = generateActions(workflows, CLINIC, DATE, NOW);
    expect(plans.map((p) => p.workflowKey)).toEqual(["yield", "patient_balances"]);
  });
});

describe("Action Engine — determinism", () => {
  it("produces byte-identical output for identical input", () => {
    const workflows = WORKFLOW_TEMPLATE_KEYS.map((key) => workflowFor(key));
    const first = generateActions(workflows, CLINIC, DATE, NOW);
    const second = generateActions(workflows, CLINIC, DATE, NOW);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("varies only by the date it was given", () => {
    const workflow = [workflowFor("cancellation_dominant")];
    const a = generateActions(workflow, CLINIC, "2026-03-11", NOW).plans[0];
    const b = generateActions(workflow, CLINIC, "2026-03-12", NOW).plans[0];
    expect(a.actions[0].target.filters).not.toEqual(b.actions[0].target.filters);
  });
});

describe("Action Engine — plan shape", () => {
  it("names exactly one primary action per plan, and it exists", () => {
    const workflows = WORKFLOW_TEMPLATE_KEYS.map((key) => workflowFor(key));
    for (const plan of generateActions(workflows, CLINIC, DATE, NOW).plans) {
      expect(plan.primaryActionId, `${plan.workflowKey} has no primary action`).not.toBeNull();
      const matches = plan.actions.filter((a) => a.id === plan.primaryActionId);
      expect(matches, `${plan.workflowKey} primary action is not in its own action list`).toHaveLength(1);
    }
  });

  it("orders actions 1..n", () => {
    const workflows = WORKFLOW_TEMPLATE_KEYS.map((key) => workflowFor(key));
    for (const plan of generateActions(workflows, CLINIC, DATE, NOW).plans) {
      expect(plan.actions.map((a) => a.order)).toEqual(
        plan.actions.map((_, i) => i + 1),
      );
    }
  });

  it("resolves dependencies to sibling action ids, never to dangling ones", () => {
    const workflows = WORKFLOW_TEMPLATE_KEYS.map((key) => workflowFor(key));
    const plans = generateActions(workflows, CLINIC, DATE, NOW).plans;

    let dependencies = 0;
    for (const plan of plans) {
      const ids = new Set(plan.actions.map((a) => a.id));
      for (const action of plan.actions) {
        for (const id of action.dependsOn) {
          dependencies += 1;
          expect(ids.has(id), `${action.id} depends on ${id}, which is not in its plan`).toBe(true);
        }
      }
    }
    // A guard on the guard: if the plans stopped declaring dependencies the
    // assertion above would pass vacuously.
    expect(dependencies).toBeGreaterThan(0);
  });

  it("carries full provenance back up the pipeline", () => {
    const workflow = workflowFor("recall_execution");
    const plan = generateActions([workflow], CLINIC, DATE, NOW).plans[0];

    expect(plan.workflowId).toBe(workflow.id);
    expect(plan.strategyId).toBe(workflow.strategyId);
    expect(plan.constraintId).toBe(workflow.constraintId);
    for (const action of plan.actions) {
      expect(action.workflowId).toBe(workflow.id);
      expect(action.strategyId).toBe(workflow.strategyId);
      expect(action.constraintId).toBe(workflow.constraintId);
      expect(action.createdAt).toBe(NOW);
    }
  });

  it("skips a workflow it has no plan for rather than inventing one", () => {
    const { plans } = generateActions(
      [workflowFor("a_template_that_does_not_exist")],
      CLINIC,
      DATE,
      NOW,
    );
    expect(plans).toEqual([]);
  });

  it("returns nothing for no workflows", () => {
    expect(generateActions([], CLINIC, DATE, NOW).plans).toEqual([]);
  });
});

describe("Action Engine — filters and windows", () => {
  it("fills date filters from the run's business date", () => {
    const w = actionDateWindows(DATE);
    const plan = generateActions([workflowFor("no_show_dominant")], CLINIC, DATE, NOW).plans[0];
    const tomorrow = plan.actions.find((a) => a.capability === "open_tomorrows_schedule");

    expect(tomorrow?.target.filters).toEqual({
      status: "scheduled",
      dateFrom: w.tomorrow,
      dateTo: w.tomorrow,
    });
  });

  it("runs the week Monday to Sunday, matching the app's quick filters", () => {
    // 2026-03-11 is a Wednesday.
    const w = actionDateWindows("2026-03-11");
    expect(w.weekStart).toBe("2026-03-09");
    expect(w.weekEnd).toBe("2026-03-15");
  });

  it("treats Sunday as the end of its week, not the start of the next", () => {
    const w = actionDateWindows("2026-03-15"); // Sunday
    expect(w.weekStart).toBe("2026-03-09");
    expect(w.weekEnd).toBe("2026-03-15");
  });

  it("gets month bounds right in a leap February", () => {
    const w = actionDateWindows("2028-02-10");
    expect(w.monthStart).toBe("2028-02-01");
    expect(w.monthEnd).toBe("2028-02-29");
  });

  it("lets a plan point a shared capability at its own screen", () => {
    const plan = generateActions([workflowFor("patient_balances")], CLINIC, DATE, NOW).plans[0];
    const callList = plan.actions.find((a) => a.capability === "prepare_call_list");
    // The catalog default is the patient directory; this plan works from payments.
    expect(ACTION_CATALOG.get("prepare_call_list")?.area).toBe("patients");
    expect(callList?.target.area).toBe("payments");
  });
});

describe("Action Engine — the catalog itself", () => {
  it("indexes every capability under its own id", () => {
    for (const id of CATALOG_IDS) {
      expect(ACTION_CATALOG.get(id)?.id).toBe(id);
    }
    expect(ACTION_CATALOG.size).toBe(CATALOG_IDS.length);
  });

  it("gives every capability a title, description and impact statement", () => {
    for (const capability of ACTION_CATALOG.values()) {
      expect(capability.title.length, capability.id).toBeGreaterThan(0);
      expect(capability.description.length, capability.id).toBeGreaterThan(0);
      expect(capability.impact.length, capability.id).toBeGreaterThan(0);
    }
  });

  it("lists in-app among the supported channels of every capability", () => {
    // A channel list that omits the channel the action is actually delivered on
    // would make a future adapter's filter drop it.
    for (const capability of ACTION_CATALOG.values()) {
      expect(capability.supportedChannels, capability.id).toContain("in_app");
    }
  });

  it("offers an outside channel only for drafts", () => {
    for (const capability of ACTION_CATALOG.values()) {
      const outside = capability.supportedChannels.filter((c) => c !== "in_app");
      if (outside.length === 0) continue;
      const isSendable =
        capability.draft !== undefined || outside.every((c) => c === "calendar");
      expect(
        isSendable,
        `${capability.id} claims channels ${outside.join(", ")} with nothing to deliver`,
      ).toBe(true);
    }
  });

  it("states a manual step whenever it admits the preparation is incomplete", () => {
    for (const capability of ACTION_CATALOG.values()) {
      if (capability.readiness !== "partially_prepared") continue;
      const explains =
        capability.sortHint !== undefined ||
        /by hand|by eye|manual|done on|checked on|picked/i.test(capability.description);
      expect(
        explains,
        `${capability.id} is partially prepared but never says which step is manual`,
      ).toBe(true);
    }
  });

  it("uses only real workflow template keys as plan keys", () => {
    const known = new Set(WORKFLOW_TEMPLATE_KEYS);
    const unknown = Object.keys(ACTION_PLANS).filter((k) => !known.has(k));
    expect(unknown, `plans for workflows that do not exist: ${unknown.join(", ")}`).toEqual([]);
  });
});
