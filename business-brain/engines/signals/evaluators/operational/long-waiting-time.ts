/**
 * Signal: operational.long_waiting_time
 *
 * Business rule: waiting-room time is the part of the visit patients talk about
 * afterwards. Past the configured ceiling it starts costing reviews, referrals,
 * and repeat visits, independent of how good the clinical work was.
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

const REQUIRED = [MetricKey.QUEUE_AVERAGE_WAITING_TIME] as const;
const OPTIONAL = [MetricKey.QUEUE_PATIENTS_WAITING] as const;

export const longWaitingTimeEvaluator: SignalEvaluator = {
  type: SignalType.OPERATIONAL_LONG_WAITING_TIME,
  category: SignalCategory.OPERATIONAL,
  requiredMetrics: REQUIRED,
  optionalMetrics: OPTIONAL,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const waitMinutes = required.metrics.value(MetricKey.QUEUE_AVERAGE_WAITING_TIME);
    const { queue } = ctx.config;

    if (waitMinutes <= queue.maximumWaitingTimeMinutes) {
      return {
        kind: "no_signal",
        reason: `Average wait ${waitMinutes} min within limit ${queue.maximumWaitingTimeMinutes} min.`,
      };
    }

    const waiting = ctx.metrics.get(MetricKey.QUEUE_PATIENTS_WAITING);

    return buildThresholdSignal(ctx, {
      type: SignalType.OPERATIONAL_LONG_WAITING_TIME,
      category: SignalCategory.OPERATIONAL,
      title: "Average waiting time above limit",
      description: `Average queue waiting time is ${formatValue(waitMinutes, MetricUnit.MINUTES)} against a configured limit of ${formatValue(queue.maximumWaitingTimeMinutes, MetricUnit.MINUTES)}.`,
      observed: {
        label: "Average waiting time",
        value: waitMinutes,
        unit: MetricUnit.MINUTES,
      },
      threshold: {
        label: "Configured maximum waiting time",
        value: queue.maximumWaitingTimeMinutes,
        unit: MetricUnit.MINUTES,
        direction: ThresholdDirection.UPPER,
      },
      inputs: waiting
        ? [{ label: "Patients waiting", value: waiting.value, unit: MetricUnit.COUNT }]
        : [],
      missingOptionalMetrics: waiting ? 0 : 1,
      metricsRead: waiting ? [...required.metrics.all, waiting] : required.metrics.all,
    });
  },
};
