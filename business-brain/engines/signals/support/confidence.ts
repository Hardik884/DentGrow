/**
 * Business Brain — Signal Engine: confidence
 *
 * Confidence here means "how complete and current was the data behind this
 * observation". It is not an AI probability and it is not a measure of how bad
 * the situation is.
 *
 * Missing REQUIRED metrics never lower confidence — the evaluator is skipped
 * instead, because a signal we cannot compute is not a low-confidence signal.
 */

import type { Confidence } from "../../../types";
import type { Metric } from "../../../domain";
import type { SignalThresholdConfig } from "../config/signal-thresholds";
import { clamp, round2 } from "./numbers";

export interface ConfidenceInput {
  readonly config: SignalThresholdConfig;
  /** How many declared optional metrics were absent. */
  readonly missingOptionalMetrics?: number;
  /** The denominator the observation rests on, when it has one. */
  readonly denominator?: number;
  /** How many read metrics describe a period other than the requested date. */
  readonly staleMetrics?: number;
}

export interface ConfidenceAssessment {
  readonly confidence: Confidence;
  /** Human-readable reasons confidence was reduced, for evidence/trace. */
  readonly deductions: readonly string[];
}

/** The date portion a metric actually describes. */
export function metricDatePart(metric: Metric): string {
  const source = metric.period?.start ?? metric.timestamp;
  return source.slice(0, 10);
}

/** How many of these metrics describe a period other than `date`. */
export function countStaleMetrics(metrics: readonly Metric[], date: string): number {
  return metrics.filter((metric) => metricDatePart(metric) !== date).length;
}

/** Compute data-completeness confidence. Rounded to 2dp for stable output. */
export function computeConfidence(input: ConfidenceInput): ConfidenceAssessment {
  const { confidence: rules, appointments } = input.config;
  const deductions: string[] = [];
  let score = 1;

  const missingOptional = input.missingOptionalMetrics ?? 0;
  if (missingOptional > 0) {
    score -= rules.missingOptionalMetricPenalty * missingOptional;
    deductions.push(`${missingOptional} optional metric(s) absent`);
  }

  if (
    input.denominator !== undefined &&
    input.denominator < appointments.minimumAppointmentSample
  ) {
    score -= rules.smallSamplePenalty;
    deductions.push(
      `governing denominator ${input.denominator} below minimum sample ${appointments.minimumAppointmentSample}`,
    );
  }

  const stale = input.staleMetrics ?? 0;
  if (stale > 0) {
    score -= rules.stalePeriodPenalty;
    deductions.push(`${stale} metric(s) describe a different period`);
  }

  return {
    confidence: round2(clamp(score, rules.floor, 1)),
    deductions,
  };
}

/** Mean confidence across emitted signals; 1 when nothing was emitted. */
export function meanConfidence(values: readonly (number | undefined)[]): Confidence {
  const present = values.filter((v): v is number => typeof v === "number");
  if (present.length === 0) return 1;
  const total = present.reduce((sum, v) => sum + v, 0);
  return round2(total / present.length);
}
