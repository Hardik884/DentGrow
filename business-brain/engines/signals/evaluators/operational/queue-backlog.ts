/**
 * Signal: operational.queue_backlog
 *
 * Business rule: a small clinic's waiting room has a physical and social limit.
 * Beyond the configured queue length the schedule has stopped matching reality,
 * regardless of the average wait figure, which lags behind the crowd.
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

const REQUIRED = [MetricKey.QUEUE_PATIENTS_WAITING] as const;

export const queueBacklogEvaluator: SignalEvaluator = {
  type: SignalType.OPERATIONAL_QUEUE_BACKLOG,
  category: SignalCategory.OPERATIONAL,
  requiredMetrics: REQUIRED,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const waiting = required.metrics.value(MetricKey.QUEUE_PATIENTS_WAITING);
    const { queue } = ctx.config;

    if (waiting <= queue.maximumQueueLength) {
      return {
        kind: "no_signal",
        reason: `${waiting} patient(s) waiting within limit ${queue.maximumQueueLength}.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.OPERATIONAL_QUEUE_BACKLOG,
      category: SignalCategory.OPERATIONAL,
      title: "Queue length above limit",
      description: `${waiting} patient(s) are waiting against a configured maximum queue length of ${queue.maximumQueueLength}.`,
      observed: { label: "Patients waiting", value: waiting, unit: MetricUnit.COUNT },
      threshold: {
        label: "Configured maximum queue length",
        value: queue.maximumQueueLength,
        unit: MetricUnit.COUNT,
        direction: ThresholdDirection.UPPER,
      },
      metricsRead: required.metrics.all,
    });
  },
};
