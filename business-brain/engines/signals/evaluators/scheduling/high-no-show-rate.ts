/**
 * Signal: scheduling.high_no_show_rate
 *
 * Business rule: a no-show is worse than a cancellation because the slot is
 * lost with no chance to refill it. Same ratio-with-sample-guard shape as the
 * cancellation rule, with a tighter tolerance.
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
  MetricKey.APPOINTMENTS_NO_SHOWS_TODAY,
  MetricKey.APPOINTMENTS_TOTAL_TODAY,
] as const;

export const highNoShowRateEvaluator: SignalEvaluator = {
  type: SignalType.SCHEDULING_HIGH_NO_SHOW_RATE,
  category: SignalCategory.SCHEDULING,
  requiredMetrics: REQUIRED,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const noShows = required.metrics.value(MetricKey.APPOINTMENTS_NO_SHOWS_TODAY);
    const total = required.metrics.value(MetricKey.APPOINTMENTS_TOTAL_TODAY);
    const { appointments } = ctx.config;

    const rate = percentageOf(noShows, total);
    if (rate === null) {
      return {
        kind: "no_signal",
        reason: "No appointments today; no-show rate is undefined.",
      };
    }

    if (total < appointments.minimumAppointmentSample) {
      return {
        kind: "no_signal",
        reason: `Appointment sample ${total} below the minimum ${appointments.minimumAppointmentSample} required for a rate signal.`,
      };
    }

    if (rate <= appointments.highNoShowRate) {
      return {
        kind: "no_signal",
        reason: `No-show rate ${rate}% within threshold ${appointments.highNoShowRate}%.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.SCHEDULING_HIGH_NO_SHOW_RATE,
      category: SignalCategory.SCHEDULING,
      title: "No-show rate above threshold",
      description: `${noShows} of ${total} appointments were no-shows today, a rate of ${formatValue(rate, MetricUnit.PERCENTAGE)} against a configured threshold of ${formatValue(appointments.highNoShowRate, MetricUnit.PERCENTAGE)}.`,
      observed: { label: "No-show rate", value: rate, unit: MetricUnit.PERCENTAGE },
      threshold: {
        label: "Configured no-show rate threshold",
        value: appointments.highNoShowRate,
        unit: MetricUnit.PERCENTAGE,
        direction: ThresholdDirection.UPPER,
      },
      inputs: [
        { label: "No-shows", value: noShows, unit: MetricUnit.COUNT },
        { label: "Total appointments", value: total, unit: MetricUnit.COUNT },
      ],
      denominator: total,
      metricsRead: required.metrics.all,
    });
  },
};
