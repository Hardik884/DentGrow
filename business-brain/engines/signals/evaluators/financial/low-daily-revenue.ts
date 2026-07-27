/**
 * Signal: revenue.low_daily_revenue
 *
 * Business rule: a day the clinic actually worked should collect at least the
 * configured daily minimum. The activity guard (appointments booked) is what
 * separates "we under-collected" from "the clinic was closed", which is why a
 * quiet Sunday does not raise a revenue alarm.
 */

import { MetricUnit, SignalCategory, SignalType } from "../../../../domain";
import { MetricKey } from "../../../metrics/metric-ids";
import { formatValue } from "../../support/evidence";
import { buildThresholdSignal } from "../../support/signal-builder";
import { ThresholdDirection } from "../../support/severity";
import {
  skippedForMissing,
  type EvaluatorContext,
  type EvaluatorOutcome,
  type SignalEvaluator,
} from "../types";

const REQUIRED = [
  MetricKey.REVENUE_COLLECTED_TODAY,
  MetricKey.APPOINTMENTS_TOTAL_TODAY,
] as const;

export const lowDailyRevenueEvaluator: SignalEvaluator = {
  type: SignalType.REVENUE_LOW_DAILY_REVENUE,
  category: SignalCategory.FINANCIAL,
  requiredMetrics: REQUIRED,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const collected = required.metrics.value(MetricKey.REVENUE_COLLECTED_TODAY);
    const appointments = required.metrics.value(MetricKey.APPOINTMENTS_TOTAL_TODAY);
    const { revenue } = ctx.config;

    if (appointments < revenue.minimumActivityForRevenueSignal) {
      return {
        kind: "no_signal",
        reason: `Clinic activity ${appointments} appointment(s) below the minimum ${revenue.minimumActivityForRevenueSignal} required to judge daily revenue.`,
      };
    }

    if (collected >= revenue.minimumDailyRevenue) {
      return {
        kind: "no_signal",
        reason: `Collected ${collected} at or above minimum ${revenue.minimumDailyRevenue}.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.REVENUE_LOW_DAILY_REVENUE,
      category: SignalCategory.FINANCIAL,
      title: "Daily revenue below minimum",
      description: `Revenue collected today is ${formatValue(collected, MetricUnit.CURRENCY)} against a configured daily minimum of ${formatValue(revenue.minimumDailyRevenue, MetricUnit.CURRENCY)}, on ${appointments} booked appointment(s).`,
      observed: {
        label: "Revenue collected today",
        value: collected,
        unit: MetricUnit.CURRENCY,
      },
      threshold: {
        label: "Configured minimum daily revenue",
        value: revenue.minimumDailyRevenue,
        unit: MetricUnit.CURRENCY,
        direction: ThresholdDirection.LOWER,
      },
      inputs: [
        { label: "Total appointments today", value: appointments, unit: MetricUnit.COUNT },
      ],
      denominator: appointments,
      metricsRead: required.metrics.all,
    });
  },
};
