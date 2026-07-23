/**
 * WorkflowEngine
 *
 * RESPONSIBILITY:
 * Decomposes a chosen strategy into an ordered, executable workflow of
 * concrete steps. It bridges strategic intent and operational execution.
 *
 * Consumes:  a selected strategy (from StrategyEngine)
 * Produces:  a sequenced workflow definition of steps
 *
 * This phase defines the contract only. No workflow logic is implemented.
 */

import { BaseEngine } from "../core";

/** Placeholder input. The concrete workflow input is defined later. */
export type WorkflowEngineInput = unknown;

/** Placeholder output. The concrete workflow payload is defined later. */
export type WorkflowEngineOutput = unknown;

export abstract class WorkflowEngine extends BaseEngine<
  WorkflowEngineInput,
  WorkflowEngineOutput
> {
  readonly name = "WorkflowEngine";
}
