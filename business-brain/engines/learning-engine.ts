/**
 * LearningEngine
 *
 * RESPONSIBILITY:
 * Feeds outcomes and value back into the system to improve future
 * diagnoses and strategies (tuning thresholds, weighting evidence,
 * ranking strategies). It is how the Business Brain gets smarter over time.
 *
 * Consumes:  outcomes + value assessments + decision traces
 * Produces:  learning updates (e.g. adjusted thresholds / weights)
 *
 * This phase defines the contract only. No learning logic is implemented.
 */

import { BaseEngine } from "../core";

/** Placeholder input. The concrete learning input is defined later. */
export type LearningEngineInput = unknown;

/** Placeholder output. The concrete learning payload is defined later. */
export type LearningEngineOutput = unknown;

export abstract class LearningEngine extends BaseEngine<
  LearningEngineInput,
  LearningEngineOutput
> {
  readonly name = "LearningEngine";
}
