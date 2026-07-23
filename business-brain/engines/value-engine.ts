/**
 * ValueEngine
 *
 * RESPONSIBILITY:
 * Quantifies the business value delivered by outcomes (e.g. revenue gained,
 * time saved, retention improved). It translates outcomes into value the
 * clinic understands and can prioritize by.
 *
 * Consumes:  outcomes (from OutcomeEngine)
 * Produces:  value assessments with priority
 *
 * This phase defines the contract only. No value logic is implemented.
 */

import { BaseEngine } from "../core";

/** Placeholder input. The concrete value input is defined later. */
export type ValueEngineInput = unknown;

/** Placeholder output. The concrete value payload is defined later. */
export type ValueEngineOutput = unknown;

export abstract class ValueEngine extends BaseEngine<
  ValueEngineInput,
  ValueEngineOutput
> {
  readonly name = "ValueEngine";
}
