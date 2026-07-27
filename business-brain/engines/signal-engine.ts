/**
 * SignalEngine
 *
 * RESPONSIBILITY:
 * Detects meaningful changes, anomalies, and patterns in metrics and emits
 * typed "signals" (e.g. rising no-shows, dropping revenue). It turns numbers
 * into noteworthy events worth reasoning about.
 *
 * Consumes:  metrics (from MetricsEngine), plus an optional prior-period set
 *            supplied by the caller
 * Produces:  a set of signals with severity, priority, confidence, and evidence
 *
 * This file is the contract. The implementation lives in `./signals`.
 */

import { BaseEngine } from "../core";
import type { Metric, Signal } from "../domain";

/**
 * Input to the Signal Engine. Metrics arrive from the caller; the engine never
 * queries data itself, and never fetches its own prior period.
 */
export interface SignalEngineQuery {
  /** Current-period metrics, all for a single clinic. */
  readonly metrics: readonly Metric[];
  /** Optional prior-period metrics for trend comparison. */
  readonly previousMetrics?: readonly Metric[];
  /** Business date being evaluated, "YYYY-MM-DD". */
  readonly date: string;
}

export abstract class SignalEngine extends BaseEngine<SignalEngineQuery, Signal[]> {
  readonly name = "SignalEngine";
}
