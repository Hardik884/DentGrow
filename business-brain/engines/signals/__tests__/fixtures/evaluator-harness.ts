/**
 * Helpers for exercising a single evaluator in isolation.
 */

import type { Metric } from "../../../../domain";
import {
  resolveConfig,
  type DeepPartial,
  type SignalThresholdConfig,
} from "../../config/signal-thresholds";
import type { EvaluatorContext, EvaluatorOutcome, SignalEvaluator } from "../../evaluators/types";
import { buildMetricIndex } from "../../support/metric-index";
import { CLINIC_ID, DATE, NOW, metrics, type MetricValues } from "./metric-fixtures";

/** Build an evaluator context from raw key/value maps. */
export function context(
  values: MetricValues | Metric[],
  options?: {
    previous?: MetricValues | Metric[];
    config?: DeepPartial<SignalThresholdConfig>;
    date?: string;
    now?: string;
  },
): EvaluatorContext {
  const current = Array.isArray(values) ? values : metrics(values);
  const built = buildMetricIndex(current, CLINIC_ID);
  if (!built.ok) throw new Error(`fixture produced an invalid index: ${built.error.code}`);

  let previousIndex;
  if (options?.previous) {
    const previousMetrics = Array.isArray(options.previous)
      ? options.previous
      : metrics(options.previous, { date: "2026-07-25", timestamp: "2026-07-25T18:30:00.000Z" });
    const builtPrevious = buildMetricIndex(previousMetrics, CLINIC_ID);
    if (!builtPrevious.ok) throw new Error("fixture produced an invalid prior index");
    previousIndex = builtPrevious.index;
  }

  return {
    clinicId: CLINIC_ID,
    date: options?.date ?? DATE,
    now: options?.now ?? NOW,
    metrics: built.index,
    previous: previousIndex,
    config: resolveConfig(options?.config),
  };
}

/** Run an evaluator and assert it produced a signal, returning that signal. */
export function expectSignal(evaluator: SignalEvaluator, ctx: EvaluatorContext) {
  const outcome: EvaluatorOutcome = evaluator.evaluate(ctx);
  if (outcome.kind !== "signal") {
    throw new Error(
      `expected a signal from ${evaluator.type}, got ${outcome.kind}: ${outcome.reason}`,
    );
  }
  return outcome.signal;
}
