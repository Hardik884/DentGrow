/**
 * StrategyEngine
 *
 * RESPONSIBILITY:
 * Proposes strategies that address diagnoses while respecting constraints.
 * It answers "what should we do about it" at a strategic level, before any
 * concrete workflow or action is chosen.
 *
 * Consumes:  diagnoses (from DiagnosisEngine) + constraints (from ConstraintEngine)
 * Produces:  ranked, constraint-valid strategy options with priority
 *
 * This phase defines the contract only. No strategy logic is implemented.
 */

import { BaseEngine } from "../core";

/** Placeholder input. The concrete strategy input is defined later. */
export type StrategyEngineInput = unknown;

/** Placeholder output. The concrete strategy payload is defined later. */
export type StrategyEngineOutput = unknown;

export abstract class StrategyEngine extends BaseEngine<
  StrategyEngineInput,
  StrategyEngineOutput
> {
  readonly name = "StrategyEngine";
}
