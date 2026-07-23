/**
 * Business Brain — Core Engine Contract
 *
 * Defines the single shared contract that every engine adheres to. This is
 * the backbone of the Business Brain: engines are composable, loosely
 * coupled units that each take a typed input plus an execution context and
 * return a uniform {@link EngineResult}.
 *
 * This file contains NO business logic — only the contract and a minimal
 * abstract base that future engine phases extend.
 */

import type { EngineResult, ExecutionContext } from "../types";

/**
 * The universal engine interface.
 *
 * @typeParam TInput  - The engine's input payload type.
 * @typeParam TOutput - The engine's output payload type.
 */
export interface Engine<TInput = unknown, TOutput = unknown> {
  /** Stable, unique engine name (used in logging, traces, and config). */
  readonly name: string;
  /** Whether the engine is currently enabled. */
  readonly enabled: boolean;
  /**
   * Execute the engine for a given input within an execution context.
   * Implementations are provided by future phases.
   */
  execute(
    input: TInput,
    context: ExecutionContext,
  ): Promise<EngineResult<TOutput>>;
}

/**
 * Minimal abstract base for all engines.
 *
 * Provides only the shared shape (`name`, `enabled`) and the abstract
 * `execute` contract. It intentionally implements no reasoning, orchestration,
 * or data access — those are the responsibility of concrete engines built in
 * later phases.
 */
export abstract class BaseEngine<TInput = unknown, TOutput = unknown>
  implements Engine<TInput, TOutput>
{
  /** Concrete engines must declare their unique name. */
  abstract readonly name: string;

  /** Whether the engine is enabled; toggled via configuration. */
  readonly enabled: boolean;

  protected constructor(enabled = true) {
    this.enabled = enabled;
  }

  /** Concrete engines implement their behaviour in a later phase. */
  abstract execute(
    input: TInput,
    context: ExecutionContext,
  ): Promise<EngineResult<TOutput>>;
}
