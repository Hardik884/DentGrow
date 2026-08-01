/**
 * Action coverage — keeps the Workflow Engine and the Action Engine from drifting.
 *
 * The two engines live in different folders and are edited at different times.
 * Nothing structural stops someone adding a workflow template and forgetting the
 * actions for it: the dashboard would simply show a workflow with no shortcuts,
 * silently, and nobody would notice until a clinic asked why one card had buttons
 * and another did not.
 *
 * The contract, stated once and enforced here:
 *
 *   Every workflow template key has exactly one action plan.
 *   Every action plan names a workflow template key that exists.
 *   Every catalog capability is used by at least one plan.
 *   Every plan step names a capability the catalog defines.
 *   Every plan names exactly one primary action.
 *
 * Both sides are read from the real modules — `WORKFLOW_TEMPLATE_KEYS` comes from
 * the Workflow Engine's own template tables — so neither list can fall behind the
 * way a restated copy would.
 */

import { describe, expect, it } from "vitest";

import { ACTION_PLANS } from "../action-plans";
import { ACTION_CATALOG, CATALOG_IDS } from "../action-catalog";
import { generateActions } from "../action-engine";
import { WORKFLOW_TEMPLATE_KEYS, investigativeKey } from "../../workflow";
import { ConstraintCategory } from "../../../domain";
import { CLINIC, DATE, NOW, workflowFor } from "./fixtures";

describe("action coverage — workflow ↔ plan", () => {
  it("gives every workflow template an action plan", () => {
    const missing = WORKFLOW_TEMPLATE_KEYS.filter((key) => ACTION_PLANS[key] === undefined);
    expect(
      missing,
      `these workflow templates would render with no actions at all: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("carries no plan for a workflow template that no longer exists", () => {
    const known = new Set(WORKFLOW_TEMPLATE_KEYS);
    const orphaned = Object.keys(ACTION_PLANS).filter((key) => !known.has(key));
    expect(
      orphaned,
      `these plans outlived the workflow they served (dead plans): ${orphaned.join(", ")}`,
    ).toEqual([]);
  });

  it("covers every constraint category's investigative workflow", () => {
    // Investigative workflows are generated per category rather than per cause,
    // so they are the easiest set to miss when a category is added.
    for (const category of Object.values(ConstraintCategory)) {
      const key = investigativeKey(category);
      expect(ACTION_PLANS[key], `no action plan for ${key}`).toBeDefined();
    }
  });

  it("gives every plan at least two actions", () => {
    // A one-action plan is a link, not a plan — and every workflow in the engine
    // has at least a list to open and something to do with it.
    const thin = Object.entries(ACTION_PLANS)
      .filter(([, steps]) => steps.length < 2)
      .map(([key, steps]) => `${key} (${steps.length})`);
    expect(thin, `these plans are too thin to help: ${thin.join(", ")}`).toEqual([]);
  });

  it("names exactly one primary step per plan", () => {
    const wrong = Object.entries(ACTION_PLANS)
      .map(([key, steps]) => ({ key, count: steps.filter((s) => s.primary === true).length }))
      .filter((r) => r.count !== 1)
      .map((r) => `${r.key} (${r.count})`);
    expect(
      wrong,
      `a plan must name exactly one starting click: ${wrong.join(", ")}`,
    ).toEqual([]);
  });

  it("names no capability twice within one plan", () => {
    // Two steps on the same capability collide on the generated action id, which
    // would silently produce duplicate React keys and ambiguous dependencies.
    const duplicated: string[] = [];
    for (const [key, steps] of Object.entries(ACTION_PLANS)) {
      const seen = new Set<string>();
      for (const step of steps) {
        if (seen.has(step.capability)) duplicated.push(`${key}/${step.capability}`);
        seen.add(step.capability);
      }
    }
    expect(duplicated, `repeated capabilities within a plan: ${duplicated.join(", ")}`).toEqual([]);
  });
});

describe("action coverage — plan ↔ catalog", () => {
  it("names only capabilities the catalog defines", () => {
    const unknown: string[] = [];
    for (const [key, steps] of Object.entries(ACTION_PLANS)) {
      for (const step of steps) {
        if (!ACTION_CATALOG.has(step.capability)) unknown.push(`${key}/${step.capability}`);
      }
    }
    expect(unknown, `plan steps naming no known capability: ${unknown.join(", ")}`).toEqual([]);
  });

  it("uses every capability the catalog defines", () => {
    const used = new Set<string>(
      Object.values(ACTION_PLANS).flatMap((steps) => steps.map((s) => s.capability)),
    );
    const unused = CATALOG_IDS.filter((id) => !used.has(id));
    expect(
      unused,
      `these capabilities are defined but no plan offers them (dead catalog entries): ${unused.join(", ")}`,
    ).toEqual([]);
  });

  it("depends only on capabilities present in the same plan", () => {
    const dangling: string[] = [];
    for (const [key, steps] of Object.entries(ACTION_PLANS)) {
      const present = new Set(steps.map((s) => s.capability));
      for (const step of steps) {
        for (const dep of step.after ?? []) {
          if (!present.has(dep)) dangling.push(`${key}: ${step.capability} after ${dep}`);
        }
      }
    }
    expect(dangling, `dependencies on absent steps: ${dangling.join(", ")}`).toEqual([]);
  });

  it("never orders a step before the step it depends on", () => {
    const inverted: string[] = [];
    for (const [key, steps] of Object.entries(ACTION_PLANS)) {
      const positionOf = new Map(steps.map((s, i) => [s.capability, i]));
      steps.forEach((step, index) => {
        for (const dep of step.after ?? []) {
          const depIndex = positionOf.get(dep);
          if (depIndex !== undefined && depIndex > index) {
            inverted.push(`${key}: ${step.capability} listed before ${dep}`);
          }
        }
      });
    }
    expect(inverted, `steps listed before their prerequisite: ${inverted.join(", ")}`).toEqual([]);
  });
});

describe("action coverage — end to end", () => {
  it("produces a usable plan for every workflow template the engine can emit", () => {
    const workflows = WORKFLOW_TEMPLATE_KEYS.map((key) => workflowFor(key));
    const { plans } = generateActions(workflows, CLINIC, DATE, NOW);

    // One plan per workflow, in the same order, none empty.
    expect(plans).toHaveLength(WORKFLOW_TEMPLATE_KEYS.length);
    expect(plans.map((p) => p.workflowKey)).toEqual([...WORKFLOW_TEMPLATE_KEYS]);
    for (const plan of plans) {
      expect(plan.actions.length, `${plan.workflowKey} produced no actions`).toBeGreaterThan(1);
    }
  });

  it("offers at least one fully prepared action in every plan", () => {
    // The point of the feature. A plan of nothing but "open the screen and work it
    // out" saves nobody anything, so at least one action must open ready to use.
    const workflows = WORKFLOW_TEMPLATE_KEYS.map((key) => workflowFor(key));
    const bare = generateActions(workflows, CLINIC, DATE, NOW)
      .plans.filter((p) => !p.actions.some((a) => a.readiness === "prepared"))
      .map((p) => p.workflowKey);

    expect(bare, `these plans prepare nothing: ${bare.join(", ")}`).toEqual([]);
  });

  it("generates unique action ids across the whole run", () => {
    const workflows = WORKFLOW_TEMPLATE_KEYS.map((key) => workflowFor(key));
    const ids = generateActions(workflows, CLINIC, DATE, NOW).plans.flatMap((p) =>
      p.actions.map((a) => a.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
