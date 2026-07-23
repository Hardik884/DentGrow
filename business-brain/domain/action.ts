/**
 * Business Brain — Domain: Action
 *
 * One concrete task derived from a strategy (e.g. Call patient, Schedule
 * appointment, Collect payment, Request review). An Action carries enough
 * information to be rendered and acted on in the UI. Its result is captured
 * separately by an Outcome.
 */

import type { Priority } from "../types";
import type { RelatedEntity } from "./shared";
import type { ValueType } from "./value";

/**
 * The concrete kind of task an action represents.
 */
export const ActionType = {
  CALL_PATIENT: "call_patient",
  SCHEDULE_APPOINTMENT: "schedule_appointment",
  COLLECT_PAYMENT: "collect_payment",
  REQUEST_REVIEW: "request_review",
  SEND_REMINDER: "send_reminder",
  FOLLOW_UP: "follow_up",
  OTHER: "other",
} as const;

export type ActionType = (typeof ActionType)[keyof typeof ActionType];

/**
 * A single, concrete task to perform.
 */
export interface Action {
  /** Stable identifier for this action. */
  readonly id: string;
  /** The kind of task. */
  readonly type: ActionType;
  /** Short imperative title for UI (e.g. "Call John about overdue payment"). */
  readonly title: string;
  /** Fuller description / instructions for whoever performs the task. */
  readonly description: string;
  /** How urgently the task should be done. */
  readonly priority: Priority;
  /** DentGrow entities the task concerns (patient, appointment, etc.). */
  readonly relatedEntities: readonly RelatedEntity[];
  /** Id of the strategy this action serves, if any. */
  readonly strategyId?: string;
  /** Optional kind of value completing this action is expected to produce. */
  readonly expectedValueType?: ValueType;
  /** Optional ISO-8601 due date for UI prioritisation. */
  readonly dueAt?: string;
  /** ISO-8601 timestamp of when the action was created. */
  readonly createdAt: string;
}
