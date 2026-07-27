/**
 * Signal: retention.returning_volume_dropping
 *
 * Business rule: returning patients are the cheapest revenue a clinic has. A
 * fall in returning volume against the prior period means recalls, follow-ups,
 * or multi-visit treatment plans are not bringing people back.
 *
 * The absolute floor keeps 3 -> 2 patients (a 33% fall) out of the feed, and
 * gives the rule something to grade against when the percentage is undefined.
 *
 * Requires a caller-supplied prior period. The engine never fetches one.
 */

import { MetricUnit, SignalCategory, SignalType } from "../../../../domain";
import { MetricKey } from "../../../metrics/metric-ids";
import { formatValue } from "../../support/evidence";
import { percentageOf } from "../../support/numbers";
import { ThresholdDirection } from "../../support/severity";
import { buildThresholdSignal } from "../../support/signal-builder";
import {
  skippedForMissing,
  skippedForNoPreviousPeriod,
  type EvaluatorContext,
  type EvaluatorOutcome,
  type SignalEvaluator,
} from "../types";

const REQUIRED = [MetricKey.PATIENTS_RETURNING_TODAY] as const;

export const returningVolumeDroppingEvaluator: SignalEvaluator = {
  type: SignalType.RETENTION_RETURNING_VOLUME_DROPPING,
  category: SignalCategory.RETENTION,
  requiredMetrics: REQUIRED,
  requiresPreviousPeriod: true,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    if (!ctx.previous) return skippedForNoPreviousPeriod();

    const current = ctx.metrics.require(...REQUIRED);
    if (!current.ok) return skippedForMissing(current.missing);
    const prior = ctx.previous.require(...REQUIRED);
    if (!prior.ok) return skippedForMissing(prior.missing);

    const now = current.metrics.value(MetricKey.PATIENTS_RETURNING_TODAY);
    const before = prior.metrics.value(MetricKey.PATIENTS_RETURNING_TODAY);
    const { patients } = ctx.config;

    const drop = now <= before ? before - now : 0;
    if (drop < patients.returningVolumeFloor) {
      return {
        kind: "no_signal",
        reason: `Returning patients fell by ${drop}, below the absolute drop floor ${patients.returningVolumeFloor}.`,
      };
    }

    const inputs = [
      { label: "Returning patients now", value: now, unit: MetricUnit.COUNT },
      {
        label: "Returning patients prior period",
        value: before,
        unit: MetricUnit.COUNT,
      },
      { label: "Drop", value: drop, unit: MetricUnit.COUNT },
      { label: "Drop floor", value: patients.returningVolumeFloor, unit: MetricUnit.COUNT },
    ];

    const dropRate = percentageOf(drop, before);
    if (dropRate === null) {
      // Defensive: a drop at or above the floor implies a positive baseline, so
      // this branch is unreachable with the shipped defaults. It is graded
      // against the absolute floor rather than returning no_signal, so a
      // configuration with a zero floor still reports the observation.
      return buildThresholdSignal(ctx, {
        type: SignalType.RETENTION_RETURNING_VOLUME_DROPPING,
        category: SignalCategory.RETENTION,
        title: "Returning patient volume dropping",
        description: `Returning patients fell from ${before} to ${now}. The prior baseline is zero, so the absolute drop floor of ${patients.returningVolumeFloor} was applied instead of a drop rate.`,
        observed: { label: "Returning patient drop", value: drop, unit: MetricUnit.COUNT },
        threshold: {
          label: "Configured returning volume drop floor",
          value: patients.returningVolumeFloor,
          unit: MetricUnit.COUNT,
          direction: ThresholdDirection.UPPER,
        },
        inputs,
        metricsRead: [...current.metrics.all, ...prior.metrics.all],
        currentPeriodMetrics: current.metrics.all,
      });
    }

    if (dropRate <= patients.returningVolumeDropRate) {
      return {
        kind: "no_signal",
        reason: `Returning volume change ${dropRate}% within drop threshold ${patients.returningVolumeDropRate}%.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.RETENTION_RETURNING_VOLUME_DROPPING,
      category: SignalCategory.RETENTION,
      title: "Returning patient volume dropping",
      description: `Returning patients fell from ${before} to ${now} versus the prior period, a drop of ${formatValue(dropRate, MetricUnit.PERCENTAGE)} against a configured threshold of ${formatValue(patients.returningVolumeDropRate, MetricUnit.PERCENTAGE)} and an absolute floor of ${patients.returningVolumeFloor} patient(s).`,
      observed: {
        label: "Returning patient drop",
        value: dropRate,
        unit: MetricUnit.PERCENTAGE,
      },
      threshold: {
        label: "Configured returning volume drop threshold",
        value: patients.returningVolumeDropRate,
        unit: MetricUnit.PERCENTAGE,
        direction: ThresholdDirection.UPPER,
      },
      inputs,
      metricsRead: [...current.metrics.all, ...prior.metrics.all],
      currentPeriodMetrics: current.metrics.all,
    });
  },
};
