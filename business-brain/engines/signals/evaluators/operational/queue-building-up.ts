/**
 * Signal: operational.queue_building_up
 *
 * Business rule: direction, not just level. A queue growing sharply against the
 * prior period means today is running behind, early enough to still act on.
 * The absolute floor keeps 1 -> 2 patients (a 100% rise) out of the feed.
 *
 * Zero prior baseline: growth percentage is undefined, so the rule falls back to
 * the absolute floor and grades the breach against that floor instead of
 * dividing by zero.
 */

import { MetricUnit, SignalCategory, SignalType } from "../../../../domain";
import { MetricKey } from "../../../metrics/metric-ids";
import { formatValue } from "../../support/evidence";
import { growth } from "../../support/numbers";
import { ThresholdDirection } from "../../support/severity";
import { buildThresholdSignal } from "../../support/signal-builder";
import {
  skippedForMissing,
  skippedForNoPreviousPeriod,
  type EvaluatorContext,
  type EvaluatorOutcome,
  type SignalEvaluator,
} from "../types";

const REQUIRED = [MetricKey.QUEUE_PATIENTS_WAITING] as const;

export const queueBuildingUpEvaluator: SignalEvaluator = {
  type: SignalType.OPERATIONAL_QUEUE_BUILDING_UP,
  category: SignalCategory.OPERATIONAL,
  requiredMetrics: REQUIRED,
  requiresPreviousPeriod: true,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    if (!ctx.previous) return skippedForNoPreviousPeriod();

    const current = ctx.metrics.require(...REQUIRED);
    if (!current.ok) return skippedForMissing(current.missing);
    const prior = ctx.previous.require(...REQUIRED);
    if (!prior.ok) return skippedForMissing(prior.missing);

    const now = current.metrics.value(MetricKey.QUEUE_PATIENTS_WAITING);
    const before = prior.metrics.value(MetricKey.QUEUE_PATIENTS_WAITING);
    const { queue } = ctx.config;

    if (now <= queue.queueGrowthFloor) {
      return {
        kind: "no_signal",
        reason: `${now} patient(s) waiting at or below the growth floor ${queue.queueGrowthFloor}.`,
      };
    }

    const comparison = growth(now, before);
    const metricsRead = [...current.metrics.all, ...prior.metrics.all];
    const baseInputs = [
      { label: "Patients waiting now", value: now, unit: MetricUnit.COUNT },
      { label: "Patients waiting prior period", value: before, unit: MetricUnit.COUNT },
      { label: "Growth floor", value: queue.queueGrowthFloor, unit: MetricUnit.COUNT },
    ];

    if (comparison.kind === "no_baseline") {
      return buildThresholdSignal(ctx, {
        type: SignalType.OPERATIONAL_QUEUE_BUILDING_UP,
        category: SignalCategory.OPERATIONAL,
        title: "Queue building up",
        description: `Patients waiting rose from ${before} to ${now} versus the prior period. The prior baseline is zero, so the absolute growth floor of ${queue.queueGrowthFloor} was applied instead of a growth rate.`,
        observed: { label: "Patients waiting", value: now, unit: MetricUnit.COUNT },
        threshold: {
          label: "Configured queue growth floor",
          value: queue.queueGrowthFloor,
          unit: MetricUnit.COUNT,
          direction: ThresholdDirection.UPPER,
        },
        inputs: baseInputs,
        metricsRead,
        currentPeriodMetrics: current.metrics.all,
      });
    }

    if (comparison.percent <= queue.queueGrowthRate) {
      return {
        kind: "no_signal",
        reason: `Queue growth ${comparison.percent}% within threshold ${queue.queueGrowthRate}%.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.OPERATIONAL_QUEUE_BUILDING_UP,
      category: SignalCategory.OPERATIONAL,
      title: "Queue building up",
      description: `Patients waiting grew ${formatValue(comparison.percent, MetricUnit.PERCENTAGE)} versus the prior period, from ${before} to ${now}, against a configured growth threshold of ${formatValue(queue.queueGrowthRate, MetricUnit.PERCENTAGE)} and a floor of ${queue.queueGrowthFloor}.`,
      observed: {
        label: "Queue growth",
        value: comparison.percent,
        unit: MetricUnit.PERCENTAGE,
      },
      threshold: {
        label: "Configured queue growth threshold",
        value: queue.queueGrowthRate,
        unit: MetricUnit.PERCENTAGE,
        direction: ThresholdDirection.UPPER,
      },
      inputs: baseInputs,
      metricsRead,
      currentPeriodMetrics: current.metrics.all,
    });
  },
};
