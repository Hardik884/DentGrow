/**
 * Business Brain — Signal Engine (implementation)
 *
 * Thin wrapper that puts the pure core into the uniform `EngineResult`
 * envelope: it derives the clinic from the execution context, takes `now` from
 * `context.startedAt` rather than any clock, and reports confidence plus one
 * decision trace per evaluator that ran, skipped, or was suppressed.
 *
 * Deviation from the phase brief, stated deliberately: `execute` is `async`
 * because `BaseEngine.execute` (the repo-wide engine contract) returns a
 * Promise. The synchronous form the brief asks for is exposed as {@link
 * DentGrowSignalEngine.run}, which `execute` simply awaits. No I/O happens in
 * either path.
 */

import type { Signal } from "../../domain";
import type { EngineResult, ExecutionContext } from "../../types";
import { logger, type Logger } from "../../utils";
import { SignalEngine, type SignalEngineQuery } from "../signal-engine";
import type { DeepPartial, SignalThresholdConfig } from "./config/signal-thresholds";
import { evaluateSignals } from "./generate-signals";

/** Construction options for {@link DentGrowSignalEngine}. */
export interface SignalEngineOptions {
  readonly enabled?: boolean;
  readonly logger?: Logger;
  /** Threshold overrides applied to every run of this instance. */
  readonly config?: DeepPartial<SignalThresholdConfig>;
}

/**
 * The DentGrow Signal Engine.
 *
 * Reads metrics only. No database access, no repositories, no AI, no clock.
 */
export class DentGrowSignalEngine extends SignalEngine {
  private readonly log: Logger;
  private readonly config?: DeepPartial<SignalThresholdConfig>;

  constructor(options?: SignalEngineOptions) {
    super(options?.enabled ?? true);
    this.log = options?.logger ?? logger;
    this.config = options?.config;
  }

  /**
   * Synchronous engine run. Everything the engine does is pure computation, so
   * this is the primary entry point; `execute` wraps it for contract
   * compatibility.
   */
  run(input: SignalEngineQuery, context: ExecutionContext): EngineResult<Signal[]> {
    const now = context.startedAt;
    const result = evaluateSignals({
      metrics: input.metrics,
      previousMetrics: input.previousMetrics,
      clinicId: context.clinicId,
      date: input.date,
      now,
      config: this.config,
    });

    if (result.error) {
      this.log.warn("Signal Engine rejected its input", {
        engine: this.name,
        clinicId: context.clinicId,
        correlationId: context.correlationId,
        date: input.date,
        code: result.error.code,
      });
      return {
        ok: false,
        data: null,
        error: result.error,
        trace: result.traces,
        generatedAt: now,
      };
    }

    return {
      ok: true,
      data: [...result.signals],
      confidence: result.confidence,
      trace: result.traces,
      generatedAt: now,
    };
  }

  /** Engine contract entry point. Delegates to {@link run}; performs no I/O. */
  async execute(
    input: SignalEngineQuery,
    context: ExecutionContext,
  ): Promise<EngineResult<Signal[]>> {
    return this.run(input, context);
  }
}
