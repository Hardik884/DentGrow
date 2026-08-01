/**
 * Action view — keeps the engine's targets and the app's routes from drifting.
 *
 * The Action Engine names a logical area and a set of query parameters; this
 * layer turns that into an href. Two failures are possible and both are silent:
 *
 * 1. The engine adds an area with no route mapping, and the action renders with
 *    no link even though a screen exists.
 * 2. The engine emits a query parameter the destination route does not read, and
 *    the link opens an UNFILTERED screen while the card says it is filtered.
 *
 * The second is the worse one. A dentist who clicks "cancellations from the last
 * 7 days" and lands on every appointment ever booked has been lied to by the
 * dashboard, which costs more than the shortcut ever saved. So the accepted
 * parameters of every destination are restated here, deliberately, and checked
 * against every filter the engine can emit.
 *
 * The route paths and parameter lists below are the ONE place in the system where
 * DentGrow's URLs are mirrored. Changing a route means changing this file, and
 * that is the intent: the test fails first.
 */

import { describe, expect, it } from "vitest";

import {
  DentGrowArea,
  generateActions,
  WORKFLOW_TEMPLATE_KEYS,
  Priority,
  WorkflowEffort,
  WorkflowOwner,
  WorkflowTimeframe,
  type Workflow,
} from "@/business-brain";
import {
  buildActionPlanViews,
  buildActionSummary,
  resolveHref,
  type ActionAudience,
} from "../action-view";

const CLINIC = "clinic-dev";
const DATE = "2026-03-11";
const NOW = "2026-03-11T09:00:00.000Z";

function workflowFor(templateKey: string): Workflow {
  return {
    id: `workflow.test.${templateKey}:${CLINIC}:${DATE}`,
    templateKey,
    title: `Workflow for ${templateKey}`,
    reason: "Test fixture",
    owner: WorkflowOwner.RECEPTIONIST,
    priority: Priority.HIGH,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.TODAY,
    tasks: [{ id: "t1", order: 1, instruction: "Do the thing" }],
    expectedOutcome: { description: "The thing is done" },
    strategyId: `strategy.test.${templateKey}:${CLINIC}:${DATE}`,
    constraintId: `constraint.test:${CLINIC}:${DATE}`,
    involvedEntities: [],
    createdAt: NOW,
  };
}

const ALL_PLANS = generateActions(
  WORKFLOW_TEMPLATE_KEYS.map(workflowFor),
  CLINIC,
  DATE,
  NOW,
).plans;

const ALL_ACTIONS = ALL_PLANS.flatMap((p) => p.actions);

/**
 * Query parameters each destination actually reads, mirrored from the route's own
 * `searchParams` type. `null` means the dentist has no screen for that area.
 */
const ACCEPTED_PARAMS: Record<string, readonly string[] | null> = {
  appointments: ["status", "search", "dateFrom", "dateTo", "timeFrom", "timeTo", "page"],
  // /dentist/appointments/new takes no query parameters.
  appointment_scheduler: [],
  patients: ["page", "search", "filter"],
  patient_record: ["tab"],
  treatments: ["status", "search", "treatmentType", "dateFrom", "dateTo", "page"],
  payments: ["search", "method", "paymentType", "dateFrom", "dateTo", "page"],
  payment_form: ["patient"],
  follow_ups: ["search", "status", "confirmation", "treatmentType", "dateFrom", "dateTo", "page"],
  follow_up_form: ["patient", "patientName", "appointment", "treatment", "back"],
  queue: [],
  availability_settings: [],
  clinic_settings: [],
  analytics: ["from", "to"],
};

describe("action view — every area is routable", () => {
  it("maps every area in the domain for the dentist", () => {
    const unmapped = Object.values(DentGrowArea).filter((area) => {
      const href = resolveHref(actionInArea(area), "dentist");
      return href === null;
    });
    expect(
      unmapped,
      `these areas produce no dentist link, so their actions render dead: ${unmapped.join(", ")}`,
    ).toEqual([]);
  });

  it("produces an absolute in-app path for every area and audience", () => {
    for (const area of Object.values(DentGrowArea)) {
      for (const audience of ["dentist", "receptionist"] as ActionAudience[]) {
        const href = resolveHref(actionInArea(area), audience);
        if (href === null) continue; // No screen for this role — allowed and handled.
        expect(href.startsWith("/"), `${area}/${audience} → ${href}`).toBe(true);
      }
    }
  });
});

describe("action view — filters the routes actually read", () => {
  it("emits no query parameter its destination ignores", () => {
    const bogus: string[] = [];
    for (const action of ALL_ACTIONS) {
      const accepted = ACCEPTED_PARAMS[action.target.area];
      expect(accepted, `no accepted-parameter list for area ${action.target.area}`).toBeDefined();
      for (const key of Object.keys(action.target.filters)) {
        if (accepted !== null && !accepted.includes(key)) {
          bogus.push(`${action.capability} → ${action.target.area}?${key}`);
        }
      }
    }
    expect(
      bogus,
      `these filters would be dropped by the destination, so the screen opens unfiltered: ${bogus.join(", ")}`,
    ).toEqual([]);
  });

  it("builds the href with every filter attached", () => {
    const action = ALL_ACTIONS.find((a) => a.capability === "open_cancelled_appointments");
    expect(action).toBeDefined();
    const href = resolveHref(action!, "dentist");
    expect(href).toBe(
      "/dentist/appointments?status=cancelled&dateFrom=2026-03-05&dateTo=2026-03-11",
    );
  });

  it("drops the query string entirely when there is nothing to filter", () => {
    const action = ALL_ACTIONS.find((a) => a.capability === "open_queue_board");
    expect(resolveHref(action!, "dentist")).toBe("/dentist/queue");
  });
});

describe("action view — projection", () => {
  it("gives every plan a primary action and the rest in order", () => {
    const views = buildActionPlanViews(ALL_PLANS, "dentist");
    expect(views).toHaveLength(ALL_PLANS.length);

    for (const view of views) {
      expect(view.primary, `${view.workflowTitle} has no primary action`).not.toBeNull();
      expect(view.rest).toHaveLength(view.actionCount - 1);
      expect(view.rest.map((a) => a.order)).toEqual(
        [...view.rest.map((a) => a.order)].sort((a, b) => a - b),
      );
    }
  });

  it("labels every action rather than leaking a raw enum value", () => {
    for (const view of buildActionPlanViews(ALL_PLANS, "dentist")) {
      for (const action of [view.primary, ...view.rest]) {
        if (action === null) continue;
        expect(action.categoryLabel).not.toContain("_");
        expect(action.readinessLabel).not.toContain("_");
        expect(action.effortLabel).not.toContain("_");
        expect(action.actionLabel.length).toBeGreaterThan(0);
      }
    }
  });

  it("gives a draft no link, because its content is the action", () => {
    for (const view of buildActionPlanViews(ALL_PLANS, "dentist")) {
      for (const action of [view.primary, ...view.rest]) {
        if (action === null) continue;
        if (action.kind === "prepare_draft") {
          expect(action.href, `${action.title} should not navigate`).toBeNull();
          expect(action.draft).toBeDefined();
        }
      }
    }
  });

  it("names the prerequisite of a dependent action", () => {
    const views = buildActionPlanViews(ALL_PLANS, "dentist");
    const withDeps = views
      .flatMap((v) => [v.primary, ...v.rest])
      .filter((a): a is NonNullable<typeof a> => a !== null && a.afterTitles.length > 0);

    expect(withDeps.length).toBeGreaterThan(0);
    for (const action of withDeps) {
      for (const title of action.afterTitles) expect(title.length).toBeGreaterThan(0);
    }
  });

  it("summarises without inventing anything", () => {
    const summary = buildActionSummary(ALL_PLANS);
    expect(summary.planCount).toBe(ALL_PLANS.length);
    expect(summary.actionCount).toBe(ALL_ACTIONS.length);
    expect(summary.preparedCount).toBe(
      ALL_ACTIONS.filter((a) => a.readiness === "prepared").length,
    );
    expect(summary.draftCount).toBe(ALL_ACTIONS.filter((a) => a.draft !== undefined).length);
  });

  it("returns nothing for no plans", () => {
    expect(buildActionPlanViews([], "dentist")).toEqual([]);
    expect(buildActionSummary([]).planCount).toBe(0);
  });
});

/** A minimal action, used only to exercise the area → route mapping. */
function actionInArea(area: string) {
  const template = ALL_ACTIONS[0];
  return {
    ...template,
    target: { area: area as (typeof DentGrowArea)[keyof typeof DentGrowArea], filters: {} },
  };
}
