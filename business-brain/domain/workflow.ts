/**
 * Business Brain — Domain: Workflow
 *
 * An execution plan derived from a strategy. A Workflow is NOT a message, a
 * notification, or an API call. It is the structured answer to:
 *
 *   What needs to be done?
 *   Why?
 *   Who should do it?
 *   What priority is it?
 *   When should it happen?
 *   What is the expected business outcome?
 *   Which patients (if any) are involved?
 *
 * A Workflow is the last output before human action. It tells the clinic
 * staff exactly what to do, in what order, and why — without doing it for them.
 *
 * The Workflow Engine is deterministic. Same strategies → same workflows.
 * No AI, no randomness, no clock, no I/O.
 */

import type { Priority } from "../types";
import type { RelatedEntity } from "./shared";
import type { ValueType } from "./value";

/**
 * Who in the clinic owns this workflow.
 */
export const WorkflowOwner = {
  DENTIST: "dentist",
  RECEPTIONIST: "receptionist",
  /** Owner is both, or the clinic decides based on their staffing. */
  EITHER: "either",
} as const;

export type WorkflowOwner = (typeof WorkflowOwner)[keyof typeof WorkflowOwner];

/**
 * How much effort a workflow requires. Helps staff triage when several
 * workflows compete for the same morning.
 */
export const WorkflowEffort = {
  /** Under 15 minutes — a phone call, a quick check. */
  QUICK: "quick",
  /** 15–60 minutes — reviewing a list, contacting a few patients. */
  MODERATE: "moderate",
  /** Over an hour — working through a backlog. */
  SUBSTANTIAL: "substantial",
} as const;

export type WorkflowEffort = (typeof WorkflowEffort)[keyof typeof WorkflowEffort];

/**
 * When the workflow should be acted on.
 */
export const WorkflowTimeframe = {
  /** Today, before the clinic closes. */
  TODAY: "today",
  /** Within this working week. */
  THIS_WEEK: "this_week",
  /** Within the next two weeks. */
  SOON: "soon",
  /** No deadline, but track progress. */
  ONGOING: "ongoing",
} as const;

export type WorkflowTimeframe = (typeof WorkflowTimeframe)[keyof typeof WorkflowTimeframe];

/**
 * A single step within a workflow. Concrete enough to tick off.
 */
export interface WorkflowTask {
  /** Stable identifier within the workflow. */
  readonly id: string;
  /** Sequence number — 1-indexed, determines display and execution order. */
  readonly order: number;
  /** Short imperative instruction: "Review cancellations from the last 7 days". */
  readonly instruction: string;
  /** Optional detail on HOW to do this in DentGrow. */
  readonly hint?: string;
}

/**
 * The expected business outcome if the workflow is completed.
 * A statement of what success looks like — never a forecast or a promise.
 */
export interface WorkflowOutcome {
  /** Plain statement: "Recovered appointments and improved utilization". */
  readonly description: string;
  /** The kind of value this outcome produces, if applicable. */
  readonly valueType?: ValueType;
}

/**
 * A structured execution plan derived from a strategy.
 */
export interface Workflow {
  /** Stable identifier: `workflow.<category>.<slug>:<clinicId>:<date>` */
  readonly id: string;
  /**
   * Stable key of the template that produced this workflow, independent of
   * clinic and date: a hypothesis slug like `retention_driven` for a corrective
   * workflow, or `investigate.<category>` for an investigative one.
   *
   * Carried explicitly rather than parsed back out of `id` by consumers. The
   * Action Engine keys its plans on this, and a key recovered by string-slicing
   * an id would silently change meaning the first time the id format moved.
   */
  readonly templateKey: string;
  /** Short, action-oriented title for the card header. */
  readonly title: string;
  /** Why this workflow exists — the business reason, not the technical one. */
  readonly reason: string;
  /** Who in the clinic should own and complete this workflow. */
  readonly owner: WorkflowOwner;
  /** How urgent relative to other workflows. */
  readonly priority: Priority;
  /** How much effort this requires. */
  readonly effort: WorkflowEffort;
  /** When it should be completed. */
  readonly timeframe: WorkflowTimeframe;
  /** Ordered steps to follow. */
  readonly tasks: readonly WorkflowTask[];
  /** What completing this should achieve. */
  readonly expectedOutcome: WorkflowOutcome;
  /** Strategy id this workflow serves. */
  readonly strategyId: string;
  /** Constraint id (inherited from strategy). */
  readonly constraintId: string;
  /**
   * Patients this workflow involves, if the engine can identify them.
   * Empty when the workflow is about a process, not about specific people.
   */
  readonly involvedEntities: readonly RelatedEntity[];
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
}
