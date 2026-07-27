/**
 * Signal: revenue.outstanding_increasing
 *
 * Business rule: the direction of the receivable book matters as much as its
 * size. A balance that is still under the absolute limit but climbing fast is
 * the earliest visible sign that collection is falling behind billing.
 *
 * The absolute floor keeps INR 800 -> INR 1,200 (a 50% rise) out of the feed,
 * and gives a zero prior baseline something to grade against: INR 0 -> INR
 * 40,000 is the clearest possible version of this signal, so it must not fall
 * through a divide-by-zero guard into silence.
 *
 * Requires a caller-supplied prior period. The engine never fetches one.
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

const REQUIRED = [MetricKey.REVENUE_OUTSTANDING] as const;

export const outstandingIncreasingEvaluator: SignalEvaluator = {
  type: SignalType.REVENUE_OUTSTANDING_INCREASING,
  category: SignalCategory.FINANCIAL,
  requiredMetrics: REQUIRED,
  requiresPreviousPeriod: true,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    if (!ctx.previous) return skippedForNoPreviousPeriod();

    const current = ctx.metrics.require(...REQUIRED);
    if (!current.ok) return skippedForMissing(current.missing);
    const prior = ctx.previous.require(...REQUIRED);
    if (!prior.ok) return skippedForMissing(prior.missing);

    const now = current.metrics.value(MetricKey.REVENUE_OUTSTANDING);
    const before = prior.metrics.value(MetricKey.REVENUE_OUTSTANDING);
    const { revenue } = ctx.config;

    if (now <= revenue.outstandingGrowthFloor) {
      return {
        kind: "no_signal",
        reason: `Outstanding balance ${now} at or below the growth floor ${revenue.outstandingGrowthFloor}.`,
      };
    }

    const comparison = growth(now, before);
    const inputs = [
      { label: "Outstanding balance now", value: now, unit: MetricUnit.CURRENCY },
      {
        label: "Outstanding balance prior period",
        value: before,
        unit: MetricUnit.CURRENCY,
      },
      { label: "Change", value: comparison.delta, unit: MetricUnit.CURRENCY },
      {
        label: "Growth floor",
        value: revenue.outstandingGrowthFloor,
        unit: MetricUnit.CURRENCY,
      },
    ];

    if (comparison.kind === "no_baseline") {
      return buildThresholdSignal(ctx, {
        type: SignalType.REVENUE_OUTSTANDING_INCREASING,
        category: SignalCategory.FINANCIAL,
        title: "Outstanding balance increasing",
        description: `Outstanding balances rose from ${formatValue(before, MetricUnit.CURRENCY)} to ${formatValue(now, MetricUnit.CURRENCY)}. The prior baseline is zero, so the absolute growth floor of ${formatValue(revenue.outstandingGrowthFloor, MetricUnit.CURRENCY)} was applied instead of a growth rate.`,
        observed: {
          label: "Outstanding balance",
          value: now,
          unit: MetricUnit.CURRENCY,
        },
        threshold: {
          label: "Configured outstanding growth floor",
          value: revenue.outstandingGrowthFloor,
          unit: MetricUnit.CURRENCY,
          direction: ThresholdDirection.UPPER,
        },
        inputs,
        metricsRead: [...current.metrics.all, ...prior.metrics.all],
        currentPeriodMetrics: current.metrics.all,
      });
    }

    if (comparison.percent <= revenue.outstandingGrowthRate) {
      return {
        kind: "no_signal",
        reason: `Outstanding growth ${comparison.percent}% within threshold ${revenue.outstandingGrowthRate}%.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.REVENUE_OUTSTANDING_INCREASING,
      category: SignalCategory.FINANCIAL,
      title: "Outstanding balance increasing",
      description: `Outstanding balances grew ${formatValue(comparison.percent, MetricUnit.PERCENTAGE)} versus the prior period, from ${formatValue(before, MetricUnit.CURRENCY)} to ${formatValue(now, MetricUnit.CURRENCY)}, against a configured growth threshold of ${formatValue(revenue.outstandingGrowthRate, MetricUnit.PERCENTAGE)} and a floor of ${formatValue(revenue.outstandingGrowthFloor, MetricUnit.CURRENCY)}.`,
      observed: {
        label: "Outstanding balance growth",
        value: comparison.percent,
        unit: MetricUnit.PERCENTAGE,
      },
      threshold: {
        label: "Configured outstanding growth threshold",
        value: revenue.outstandingGrowthRate,
        unit: MetricUnit.PERCENTAGE,
        direction: ThresholdDirection.UPPER,
      },
      inputs,
      metricsRead: [...current.metrics.all, ...prior.metrics.all],
      currentPeriodMetrics: current.metrics.all,
    });
  },
};
