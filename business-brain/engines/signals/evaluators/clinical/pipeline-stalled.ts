/**
 * Signal: clinical.pipeline_stalled
 *
 * Business rule: a relationship no single metric can show. There is a large book
 * of planned treatment (demand banked), the day is booked below the minimum
 * (nothing happening), and slots are still open (capacity free). Demand and
 * capacity both exist on the same day and are not meeting.
 *
 * The pending-value limit grades the severity, because that is the money the
 * stall is holding up.
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

const REQUIRED = [
  MetricKey.REVENUE_PENDING_TREATMENT_VALUE,
  MetricKey.APPOINTMENTS_TOTAL_TODAY,
  MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY,
] as const;

export const pipelineStalledEvaluator: SignalEvaluator = {
  type: SignalType.CLINICAL_PIPELINE_STALLED,
  category: SignalCategory.CLINICAL,
  requiredMetrics: REQUIRED,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const pending = required.metrics.value(MetricKey.REVENUE_PENDING_TREATMENT_VALUE);
    const appointments = required.metrics.value(MetricKey.APPOINTMENTS_TOTAL_TODAY);
    const openSlots = required.metrics.value(MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY);
    const { treatment, appointments: appointmentRules } = ctx.config;

    if (pending <= treatment.pendingTreatmentValueLimit) {
      return {
        kind: "no_signal",
        reason: `Pending treatment value ${pending} within limit ${treatment.pendingTreatmentValueLimit}; no banked demand to stall.`,
      };
    }
    if (appointments >= appointmentRules.minimumDailyAppointments) {
      return {
        kind: "no_signal",
        reason: `${appointments} appointment(s) at or above minimum ${appointmentRules.minimumDailyAppointments}; the schedule is moving.`,
      };
    }
    if (openSlots <= 0) {
      return {
        kind: "no_signal",
        reason: "No available slots today; there is no free capacity for the pipeline to use.",
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.CLINICAL_PIPELINE_STALLED,
      category: SignalCategory.CLINICAL,
      title: "Treatment pipeline stalled",
      description: `${formatValue(pending, MetricUnit.CURRENCY)} of planned treatment is pending while only ${appointments} appointment(s) are booked today and ${openSlots} slot(s) remain open. Pending value exceeds the configured limit of ${formatValue(treatment.pendingTreatmentValueLimit, MetricUnit.CURRENCY)} and booked volume is below the minimum of ${appointmentRules.minimumDailyAppointments}.`,
      observed: {
        label: "Pending treatment value",
        value: pending,
        unit: MetricUnit.CURRENCY,
      },
      threshold: {
        label: "Configured pending treatment value limit",
        value: treatment.pendingTreatmentValueLimit,
        unit: MetricUnit.CURRENCY,
        direction: ThresholdDirection.UPPER,
      },
      inputs: [
        { label: "Total appointments today", value: appointments, unit: MetricUnit.COUNT },
        {
          label: "Minimum daily appointments",
          value: appointmentRules.minimumDailyAppointments,
          unit: MetricUnit.COUNT,
        },
        { label: "Available slots today", value: openSlots, unit: MetricUnit.COUNT },
      ],
      denominator: appointments,
      metricsRead: required.metrics.all,
    });
  },
};
