/**
 * Signal: operational.near_full_capacity
 *
 * Business rule: a nearly full day is worth knowing about before it happens,
 * because emergencies, walk-ins, and overruns need somewhere to go. Either
 * branch triggers it: utilization at the near-capacity mark, or almost no slots
 * left. When both fire, the worse breach grades the signal.
 *
 * Severity is capped at medium by configuration: being busy is not an emergency.
 *
 * The optional total-appointments metric is a closed-day guard. A clinic that is
 * shut also reports zero open slots, and calling that "near full" would be
 * wrong. So when the trigger rests on the slots branch alone and the guard
 * metric is absent, the evaluator SKIPS: "no slots left" and "never opened" are
 * indistinguishable without the appointment count, and a skip says that
 * honestly. The utilization branch needs no guard — a clinic at or above the
 * near-capacity mark demonstrably operated — and still emits at reduced
 * confidence when the guard metric is missing.
 */

import { MetricUnit, SignalCategory, SignalType } from "../../../../domain";
import { MetricKey } from "../../../metrics/metric-ids";
import { formatValue } from "../../support/evidence";
import {
  ThresholdDirection,
  assessBreach,
  worstOf,
  type BreachAssessment,
} from "../../support/severity";
import { buildThresholdSignal } from "../../support/signal-builder";
import {
  skippedForMissing,
  type EvaluatorContext,
  type EvaluatorOutcome,
  type SignalEvaluator,
} from "../types";

const REQUIRED = [
  MetricKey.CAPACITY_CHAIR_UTILIZATION,
  MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY,
] as const;
const OPTIONAL = [MetricKey.APPOINTMENTS_TOTAL_TODAY] as const;

export const nearFullCapacityEvaluator: SignalEvaluator = {
  type: SignalType.OPERATIONAL_NEAR_FULL_CAPACITY,
  category: SignalCategory.OPERATIONAL,
  requiredMetrics: REQUIRED,
  optionalMetrics: OPTIONAL,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const utilization = required.metrics.value(MetricKey.CAPACITY_CHAIR_UTILIZATION);
    const openSlots = required.metrics.value(MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY);
    const { capacity } = ctx.config;

    const appointments = ctx.metrics.get(MetricKey.APPOINTMENTS_TOTAL_TODAY);
    if (appointments && appointments.value <= 0) {
      return {
        kind: "no_signal",
        reason: "No appointments today; the clinic did not operate, so capacity is not constrained.",
      };
    }

    const utilizationBreached = utilization >= capacity.nearCapacityUtilization;
    const slotsBreached = openSlots <= capacity.minimumAvailableSlots;
    if (!utilizationBreached && !slotsBreached) {
      return {
        kind: "no_signal",
        reason: `Chair utilization ${utilization}% below ${capacity.nearCapacityUtilization}% and ${openSlots} slot(s) above ${capacity.minimumAvailableSlots}.`,
      };
    }

    if (!appointments && !utilizationBreached) {
      return {
        kind: "skipped",
        reason: `Only the available-slots branch is breached (${openSlots} slot(s)) and ${MetricKey.APPOINTMENTS_TOTAL_TODAY} is unavailable, so a full day cannot be distinguished from a clinic that never opened.`,
        missing: [MetricKey.APPOINTMENTS_TOTAL_TODAY],
      };
    }

    const assessments: BreachAssessment[] = [];
    if (utilizationBreached) {
      assessments.push(
        assessBreach({
          value: utilization,
          threshold: capacity.nearCapacityUtilization,
          direction: ThresholdDirection.UPPER,
          type: SignalType.OPERATIONAL_NEAR_FULL_CAPACITY,
          config: ctx.config,
        }),
      );
    }
    if (slotsBreached) {
      assessments.push(
        assessBreach({
          value: openSlots,
          threshold: capacity.minimumAvailableSlots,
          direction: ThresholdDirection.LOWER,
          type: SignalType.OPERATIONAL_NEAR_FULL_CAPACITY,
          config: ctx.config,
        }),
      );
    }
    const assessment = assessments.reduce(worstOf);

    const observed = utilizationBreached
      ? {
          label: "Chair utilization",
          value: utilization,
          unit: MetricUnit.PERCENTAGE,
        }
      : { label: "Available slots today", value: openSlots, unit: MetricUnit.COUNT };
    const threshold = utilizationBreached
      ? {
          label: "Configured near-capacity utilization",
          value: capacity.nearCapacityUtilization,
          unit: MetricUnit.PERCENTAGE,
          direction: ThresholdDirection.UPPER,
        }
      : {
          label: "Configured minimum available slots",
          value: capacity.minimumAvailableSlots,
          unit: MetricUnit.COUNT,
          direction: ThresholdDirection.LOWER,
        };

    return buildThresholdSignal(ctx, {
      type: SignalType.OPERATIONAL_NEAR_FULL_CAPACITY,
      category: SignalCategory.OPERATIONAL,
      title: "Near full capacity",
      description: `Chair utilization is ${formatValue(utilization, MetricUnit.PERCENTAGE)} with ${openSlots} slot(s) available today, against a near-capacity threshold of ${formatValue(capacity.nearCapacityUtilization, MetricUnit.PERCENTAGE)} and a minimum available slots threshold of ${capacity.minimumAvailableSlots}.`,
      observed,
      threshold,
      assessment,
      inputs: [
        { label: "Chair utilization", value: utilization, unit: MetricUnit.PERCENTAGE },
        { label: "Available slots today", value: openSlots, unit: MetricUnit.COUNT },
        ...(appointments
          ? [
              {
                label: "Total appointments today",
                value: appointments.value,
                unit: MetricUnit.COUNT,
              },
            ]
          : []),
      ],
      missingOptionalMetrics: appointments ? 0 : 1,
      metricsRead: appointments
        ? [...required.metrics.all, appointments]
        : required.metrics.all,
    });
  },
};
