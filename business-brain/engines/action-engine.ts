/**
 * ActionEngine
 *
 * RESPONSIBILITY:
 * Executes individual workflow steps as concrete actions (e.g. scheduling a
 * follow-up, flagging a patient, notifying staff). It is the only engine that
 * causes real-world side effects, always through DentGrow's existing
 * Server Actions / services in a future phase.
 *
 * Consumes:  a workflow step (from WorkflowEngine)
 * Produces:  the outcome of attempting the action
 *
 * This phase defines the contract only. No actions are executed here.
 */

import { BaseEngine } from "../core";

/** Placeholder input. The concrete action input is defined later. */
export type ActionEngineInput = unknown;

/** Placeholder output. The concrete action result is defined later. */
export type ActionEngineOutput = unknown;

export abstract class ActionEngine extends BaseEngine<
  ActionEngineInput,
  ActionEngineOutput
> {
  readonly name = "ActionEngine";
}
