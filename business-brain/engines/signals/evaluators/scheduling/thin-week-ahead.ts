/**
 * Signal: scheduling.thin_week_ahead
 *
 * Business rule: the next seven days are booked below the share of offered chair
 * time a clinic needs to have sold by now.
 *
 * THIS IS THE ONLY FORWARD-LOOKING RULE IN THE ENGINE. Every other signal reports
 * a day that is already finished — by the time a dentist reads it, the chair time
 * is gone and nothing can be done except learn from it. This one reports a week
 * that has not happened yet, while the recall list and the unbooked-treatment list
 * can still fill it. That is the whole reason it exists.
 *
 * No closed-day or activity guard is needed, and deliberately so: the metric
 * itself is WITHHELD when the forward window is absent or the clinic offered no
 * capacity across it, so a clinic shut for the week produces no metric and the
 * rule skips rather than announcing that a closed week is empty. Guarding again
 * here would restate a decision the calculator already made correctly.
 */

import { MetricUnit, SignalCategory, SignalType } from "../../../../domain";
import { MetricKey } from "../../../metrics/metric-ids";
import { formatValue } from "../../support/evidence";
import { ThresholdDirection } from "../../support/severity";
import { buildThresholdSignal } from "../../support/signal-builder";
import {
  skippedForMissing,
  type EvaluatorContext,
  type EvaluatorOutcome,
  type SignalEvaluator,
} from "../types";

const REQUIRED = [MetricKey.CAPACITY_BOOKED_NEXT_7D] as const;

export const thinWeekAheadEvaluator: SignalEvaluator = {
  type: SignalType.SCHEDULING_THIN_WEEK_AHEAD,
  category: SignalCategory.SCHEDULING,
  requiredMetrics: REQUIRED,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const booked = required.metrics.value(MetricKey.CAPACITY_BOOKED_NEXT_7D);
    const { appointments } = ctx.config;

    if (booked >= appointments.minimumWeekAheadBooked) {
      return {
        kind: "no_signal",
        reason: `Next 7 days ${booked}% booked, at or above the minimum ${appointments.minimumWeekAheadBooked}%.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.SCHEDULING_THIN_WEEK_AHEAD,
      category: SignalCategory.SCHEDULING,
      title: "Next week is booking below normal",
      description: `Only ${formatValue(booked, MetricUnit.PERCENTAGE)} of the chair time offered over the next 7 days is booked, against a configured minimum of ${formatValue(appointments.minimumWeekAheadBooked, MetricUnit.PERCENTAGE)}. Unlike every other finding, this describes days that have not happened yet.`,
      observed: {
        label: "Chair time booked, next 7 days",
        value: booked,
        unit: MetricUnit.PERCENTAGE,
      },
      threshold: {
        label: "Configured minimum booked share for the week ahead",
        value: appointments.minimumWeekAheadBooked,
        unit: MetricUnit.PERCENTAGE,
        direction: ThresholdDirection.LOWER,
      },
      inputs: [],
      metricsRead: required.metrics.all,
    });
  },
};
