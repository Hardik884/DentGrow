/**
 * Signal: scheduling.high_cancellation_rate
 *
 * Business rule: cancellations are lost chair time that was already promised to
 * someone. The share matters more than the count, so the rule is a ratio — but
 * only once the day holds enough appointments for a ratio to mean anything.
 * Two cancellations out of three appointments is a small day, not a 67% crisis.
 */

import { MetricUnit, SignalCategory, SignalType } from "../../../../domain";
import { MetricKey } from "../../../metrics/metric-ids";
import { formatValue } from "../../support/evidence";
import { percentageOf } from "../../support/numbers";
import { ThresholdDirection } from "../../support/severity";
import { buildThresholdSignal } from "../../support/signal-builder";
import {
  skippedForMissing,
  type EvaluatorContext,
  type EvaluatorOutcome,
  type SignalEvaluator,
} from "../types";

const REQUIRED = [
  MetricKey.APPOINTMENTS_CANCELLED_TODAY,
  MetricKey.APPOINTMENTS_TOTAL_TODAY,
] as const;

export const highCancellationRateEvaluator: SignalEvaluator = {
  type: SignalType.SCHEDULING_HIGH_CANCELLATION_RATE,
  category: SignalCategory.SCHEDULING,
  requiredMetrics: REQUIRED,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const cancelled = required.metrics.value(MetricKey.APPOINTMENTS_CANCELLED_TODAY);
    const total = required.metrics.value(MetricKey.APPOINTMENTS_TOTAL_TODAY);
    const { appointments } = ctx.config;

    const rate = percentageOf(cancelled, total);
    if (rate === null) {
      return {
        kind: "no_signal",
        reason: "No appointments today; cancellation rate is undefined.",
      };
    }

    if (total < appointments.minimumAppointmentSample) {
      return {
        kind: "no_signal",
        reason: `Appointment sample ${total} below the minimum ${appointments.minimumAppointmentSample} required for a rate signal.`,
      };
    }

    if (rate <= appointments.highCancellationRate) {
      return {
        kind: "no_signal",
        reason: `Cancellation rate ${rate}% within threshold ${appointments.highCancellationRate}%.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.SCHEDULING_HIGH_CANCELLATION_RATE,
      category: SignalCategory.SCHEDULING,
      title: "Cancellation rate above threshold",
      description: `${cancelled} of ${total} appointments were cancelled today, a rate of ${formatValue(rate, MetricUnit.PERCENTAGE)} against a configured threshold of ${formatValue(appointments.highCancellationRate, MetricUnit.PERCENTAGE)}.`,
      observed: { label: "Cancellation rate", value: rate, unit: MetricUnit.PERCENTAGE },
      threshold: {
        label: "Configured cancellation rate threshold",
        value: appointments.highCancellationRate,
        unit: MetricUnit.PERCENTAGE,
        direction: ThresholdDirection.UPPER,
      },
      inputs: [
        { label: "Cancelled appointments", value: cancelled, unit: MetricUnit.COUNT },
        { label: "Total appointments", value: total, unit: MetricUnit.COUNT },
      ],
      denominator: total,
      metricsRead: required.metrics.all,
    });
  },
};
