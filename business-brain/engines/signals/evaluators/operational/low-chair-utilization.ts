/**
 * Signal: operational.low_chair_utilization
 *
 * Business rule: the chair is the clinic's only production line, and unused
 * chair time cannot be recovered later. The available-slots guard is what makes
 * this honest: utilization is only "low" if there was capacity to sell. A closed
 * day reports 0% utilization with 0 open slots and must stay silent.
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
  MetricKey.CAPACITY_CHAIR_UTILIZATION,
  MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY,
] as const;

export const lowChairUtilizationEvaluator: SignalEvaluator = {
  type: SignalType.OPERATIONAL_LOW_CHAIR_UTILIZATION,
  category: SignalCategory.OPERATIONAL,
  requiredMetrics: REQUIRED,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const utilization = required.metrics.value(MetricKey.CAPACITY_CHAIR_UTILIZATION);
    const openSlots = required.metrics.value(MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY);
    const { capacity } = ctx.config;

    if (openSlots <= 0) {
      return {
        kind: "no_signal",
        reason: "No available slots today; there is no idle capacity to report.",
      };
    }

    if (utilization >= capacity.minimumChairUtilization) {
      return {
        kind: "no_signal",
        reason: `Chair utilization ${utilization}% at or above minimum ${capacity.minimumChairUtilization}%.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.OPERATIONAL_LOW_CHAIR_UTILIZATION,
      category: SignalCategory.OPERATIONAL,
      title: "Chair utilization below minimum",
      description: `Chair utilization is ${formatValue(utilization, MetricUnit.PERCENTAGE)} against a configured minimum of ${formatValue(capacity.minimumChairUtilization, MetricUnit.PERCENTAGE)}, with ${openSlots} slot(s) still open today.`,
      observed: {
        label: "Chair utilization",
        value: utilization,
        unit: MetricUnit.PERCENTAGE,
      },
      threshold: {
        label: "Configured minimum chair utilization",
        value: capacity.minimumChairUtilization,
        unit: MetricUnit.PERCENTAGE,
        direction: ThresholdDirection.LOWER,
      },
      inputs: [
        { label: "Available slots today", value: openSlots, unit: MetricUnit.COUNT },
      ],
      metricsRead: required.metrics.all,
    });
  },
};
