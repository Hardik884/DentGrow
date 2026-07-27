/**
 * Signal: scheduling.low_appointment_volume
 *
 * Business rule: the schedule is the clinic's forward revenue. A day booked
 * below the minimum is a demand or booking problem that has already happened,
 * whatever the utilization percentage says.
 *
 * Severity is capped at high by configuration: a thin day is a business problem,
 * not an emergency.
 */

import { MetricUnit, SignalCategory, SignalType } from "../../../../domain";
import { MetricKey } from "../../../metrics/metric-ids";
import { ThresholdDirection } from "../../support/severity";
import { buildThresholdSignal } from "../../support/signal-builder";
import {
  skippedForMissing,
  type EvaluatorContext,
  type EvaluatorOutcome,
  type SignalEvaluator,
} from "../types";

const REQUIRED = [MetricKey.APPOINTMENTS_TOTAL_TODAY] as const;

export const lowAppointmentVolumeEvaluator: SignalEvaluator = {
  type: SignalType.SCHEDULING_LOW_APPOINTMENT_VOLUME,
  category: SignalCategory.SCHEDULING,
  requiredMetrics: REQUIRED,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const total = required.metrics.value(MetricKey.APPOINTMENTS_TOTAL_TODAY);
    const { appointments } = ctx.config;

    if (total >= appointments.minimumDailyAppointments) {
      return {
        kind: "no_signal",
        reason: `${total} appointment(s) at or above minimum ${appointments.minimumDailyAppointments}.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.SCHEDULING_LOW_APPOINTMENT_VOLUME,
      category: SignalCategory.SCHEDULING,
      title: "Appointment volume below minimum",
      description: `${total} appointment(s) are booked today against a configured minimum of ${appointments.minimumDailyAppointments}.`,
      observed: {
        label: "Total appointments today",
        value: total,
        unit: MetricUnit.COUNT,
      },
      threshold: {
        label: "Configured minimum daily appointments",
        value: appointments.minimumDailyAppointments,
        unit: MetricUnit.COUNT,
        direction: ThresholdDirection.LOWER,
      },
      metricsRead: required.metrics.all,
    });
  },
};
