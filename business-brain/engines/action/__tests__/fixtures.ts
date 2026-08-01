/**
 * Shared fixtures for the Action Engine specs.
 *
 * Workflows are built directly rather than run through the whole pipeline. The
 * Action Engine's only input is a workflow, and its only join key is
 * `templateKey`, so constructing workflows lets a spec cover all 32 template keys
 * without needing 32 clinic-days of metrics that happen to diagnose each cause.
 *
 * The keys themselves are NOT restated here — they come from the Workflow
 * Engine's own `WORKFLOW_TEMPLATE_KEYS`, which is what makes the coverage spec a
 * drift guard rather than a second copy of the same list.
 */

import {
  WorkflowEffort,
  WorkflowOwner,
  WorkflowTimeframe,
  type Workflow,
} from "../../../domain";
import { Priority } from "../../../types";

export const CLINIC = "clinic-dev";
export const DATE = "2026-03-11"; // A Wednesday, so week bounds are non-trivial.
export const NOW = "2026-03-11T09:00:00.000Z";

/** A workflow for one template key, with everything else held constant. */
export function workflowFor(
  templateKey: string,
  overrides: Partial<Workflow> = {},
): Workflow {
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
    ...overrides,
  };
}
