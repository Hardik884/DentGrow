/**
 * lib/business-brain/workflow-view.ts
 *
 * Presentation projection of workflows for the Business Brain dashboard.
 *
 * Like dashboard-view.ts, this contains NO business logic. It reshapes what the
 * Workflow Engine decided into the structure the UI renders. Every judgement
 * (priority, effort, timeframe, owner) arrives already made.
 */

import type {
  Workflow,
  WorkflowEffort,
  WorkflowOwner,
  WorkflowTimeframe,
} from "@/business-brain";

// ─────────────────────────────────────────────────────────────────────────────
// View types — what the UI renders
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowCardView {
  readonly id: string;
  readonly title: string;
  readonly reason: string;
  readonly ownerLabel: string;
  readonly ownerIcon: "dentist" | "receptionist" | "either";
  readonly priorityLabel: string;
  readonly prioritySeverity: "critical" | "high" | "medium" | "low";
  readonly effortLabel: string;
  readonly timeframeLabel: string;
  readonly taskCount: number;
  readonly tasks: readonly {
    readonly id: string;
    readonly order: number;
    readonly instruction: string;
    readonly hint?: string;
  }[];
  readonly outcomeDescription: string;
  readonly constraintId: string;
  readonly strategyId: string;
}

export interface WorkflowGroupView {
  readonly label: string;
  readonly workflows: readonly WorkflowCardView[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Label maps
// ─────────────────────────────────────────────────────────────────────────────

const OWNER_LABELS: Record<WorkflowOwner, string> = {
  dentist: "You (Dentist)",
  receptionist: "Front desk",
  either: "Anyone",
};

const EFFORT_LABELS: Record<WorkflowEffort, string> = {
  quick: "Under 15 min",
  moderate: "15–60 min",
  substantial: "Over an hour",
};

const TIMEFRAME_LABELS: Record<WorkflowTimeframe, string> = {
  today: "Do today",
  this_week: "This week",
  soon: "In the next 2 weeks",
  ongoing: "Keep doing",
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: "Urgent",
  high: "Important",
  medium: "Worth doing",
  low: "When you have time",
};

// ─────────────────────────────────────────────────────────────────────────────
// Projection
// ─────────────────────────────────────────────────────────────────────────────

function toCardView(workflow: Workflow): WorkflowCardView {
  return {
    id: workflow.id,
    title: workflow.title,
    reason: workflow.reason,
    ownerLabel: OWNER_LABELS[workflow.owner] ?? workflow.owner,
    ownerIcon: workflow.owner,
    priorityLabel: PRIORITY_LABELS[workflow.priority] ?? workflow.priority,
    prioritySeverity: workflow.priority as WorkflowCardView["prioritySeverity"],
    effortLabel: EFFORT_LABELS[workflow.effort] ?? workflow.effort,
    timeframeLabel: TIMEFRAME_LABELS[workflow.timeframe] ?? workflow.timeframe,
    taskCount: workflow.tasks.length,
    tasks: workflow.tasks.map((t) => ({
      id: t.id,
      order: t.order,
      instruction: t.instruction,
      hint: t.hint,
    })),
    outcomeDescription: workflow.expectedOutcome.description,
    constraintId: workflow.constraintId,
    strategyId: workflow.strategyId,
  };
}

/**
 * Project workflows into view models grouped by timeframe.
 *
 * Grouping by WHEN rather than by what: a clinic owner opening this section
 * asks "what do I need to do today?" not "what category is this?". The
 * categories are already visible from the focus cards above.
 */
export function buildWorkflowGroups(workflows: readonly Workflow[]): readonly WorkflowGroupView[] {
  const timeframeOrder: WorkflowTimeframe[] = ["today", "this_week", "soon", "ongoing"];

  const groups: WorkflowGroupView[] = [];

  for (const timeframe of timeframeOrder) {
    const matching = workflows.filter((w) => w.timeframe === timeframe);
    if (matching.length === 0) continue;
    groups.push({
      label: TIMEFRAME_LABELS[timeframe],
      workflows: matching.map(toCardView),
    });
  }

  return groups;
}

/**
 * Summary stats for the workflow section header.
 */
export interface WorkflowSummary {
  readonly totalCount: number;
  readonly todayCount: number;
  readonly totalEstimatedMinutes: number;
}

const EFFORT_MINUTES: Record<WorkflowEffort, number> = {
  quick: 10,
  moderate: 35,
  substantial: 75,
};

export function buildWorkflowSummary(workflows: readonly Workflow[]): WorkflowSummary {
  return {
    totalCount: workflows.length,
    todayCount: workflows.filter((w) => w.timeframe === "today").length,
    totalEstimatedMinutes: workflows.reduce(
      (sum, w) => sum + (EFFORT_MINUTES[w.effort] ?? 30),
      0,
    ),
  };
}
