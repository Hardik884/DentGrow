/**
 * SignalEngine
 *
 * RESPONSIBILITY:
 * Detects meaningful changes, anomalies, and patterns in metrics over time
 * and emits typed "signals" (e.g. rising no-shows, dropping revenue). It
 * turns numbers into noteworthy events worth reasoning about.
 *
 * Consumes:  metrics (from MetricsEngine)
 * Produces:  a set of prioritized signals with severity
 *
 * This phase defines the contract only. No signal detection is implemented.
 */

import { BaseEngine } from "../core";

/** Placeholder input. The concrete signal-detection input is defined later. */
export type SignalEngineInput = unknown;

/** Placeholder output. The concrete signal payload is defined later. */
export type SignalEngineOutput = unknown;

export abstract class SignalEngine extends BaseEngine<
  SignalEngineInput,
  SignalEngineOutput
> {
  readonly name = "SignalEngine";
}
