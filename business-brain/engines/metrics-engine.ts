/**
 * MetricsEngine
 *
 * RESPONSIBILITY:
 * Computes and exposes the clinic's core business metrics (KPIs) from raw
 * operational data. It is the quantitative foundation the rest of the
 * Business Brain reasons about.
 *
 * Consumes:  raw clinic data (via repositories, in a future phase)
 * Produces:  a normalized set of metrics for a clinic + time window
 *
 * This phase defines the contract only. No metrics are computed here.
 */

import { BaseEngine } from "../core";

/** Placeholder input. The concrete metrics query shape is defined later. */
export type MetricsEngineInput = unknown;

/** Placeholder output. The concrete metrics payload is defined later. */
export type MetricsEngineOutput = unknown;

export abstract class MetricsEngine extends BaseEngine<
  MetricsEngineInput,
  MetricsEngineOutput
> {
  readonly name = "MetricsEngine";
}
