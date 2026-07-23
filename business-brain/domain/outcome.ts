/**
 * Business Brain — Domain: Outcome
 *
 * The result of an Action (e.g. Completed, Ignored, Failed, Cancelled). An
 * Outcome closes the loop on a task and optionally records the value it
 * realised.
 */

import type { Value } from "./value";

/**
 * The terminal status of an action.
 */
export const OutcomeStatus = {
  COMPLETED: "completed",
  IGNORED: "ignored",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type OutcomeStatus = (typeof OutcomeStatus)[keyof typeof OutcomeStatus];

/**
 * The recorded result of performing an action.
 */
export interface Outcome {
  /** Stable identifier for this outcome. */
  readonly id: string;
  /** Id of the action this outcome resulted from. */
  readonly actionId: string;
  /** How the action ended. */
  readonly status: OutcomeStatus;
  /** Optional free-text note about what happened. */
  readonly note?: string;
  /** Optional realised value produced by the action. */
  readonly value?: Value;
  /** ISO-8601 timestamp of when the outcome was recorded. */
  readonly recordedAt: string;
}
