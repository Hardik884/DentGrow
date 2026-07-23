/**
 * ConstraintEngine
 *
 * RESPONSIBILITY:
 * Encodes and evaluates the real-world limits a clinic operates under
 * (capacity, staffing, budget, regulatory, and policy constraints). It
 * ensures downstream strategies and actions remain feasible.
 *
 * Consumes:  clinic configuration + diagnoses / candidate strategies
 * Produces:  the set of active constraints and feasibility verdicts
 *
 * This phase defines the contract only. No constraint logic is implemented.
 */

import { BaseEngine } from "../core";

/** Placeholder input. The concrete constraint input is defined later. */
export type ConstraintEngineInput = unknown;

/** Placeholder output. The concrete constraint payload is defined later. */
export type ConstraintEngineOutput = unknown;

export abstract class ConstraintEngine extends BaseEngine<
  ConstraintEngineInput,
  ConstraintEngineOutput
> {
  readonly name = "ConstraintEngine";
}
