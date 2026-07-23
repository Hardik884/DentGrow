/**
 * OutcomeEngine
 *
 * RESPONSIBILITY:
 * Measures what actually happened after actions were taken and compares it
 * against the expected result. It closes the loop between decision and reality.
 *
 * Consumes:  executed actions (from ActionEngine) + subsequent metrics
 * Produces:  outcome assessments (expected vs. actual)
 *
 * This phase defines the contract only. No outcome logic is implemented.
 */

import { BaseEngine } from "../core";

/** Placeholder input. The concrete outcome input is defined later. */
export type OutcomeEngineInput = unknown;

/** Placeholder output. The concrete outcome payload is defined later. */
export type OutcomeEngineOutput = unknown;

export abstract class OutcomeEngine extends BaseEngine<
  OutcomeEngineInput,
  OutcomeEngineOutput
> {
  readonly name = "OutcomeEngine";
}
