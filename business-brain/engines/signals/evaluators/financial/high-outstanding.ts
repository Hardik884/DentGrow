/**
 * Signal: revenue.high_outstanding
 *
 * Business rule: money already earned but not yet collected is working capital
 * sitting outside the clinic. Past a configured ceiling the balance is large
 * enough to matter regardless of how it accumulated.
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

const REQUIRED = [MetricKey.REVENUE_OUTSTANDING] as const;

export const highOutstandingEvaluator: SignalEvaluator = {
  type: SignalType.REVENUE_HIGH_OUTSTANDING,
  category: SignalCategory.FINANCIAL,
  requiredMetrics: REQUIRED,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const outstanding = required.metrics.value(MetricKey.REVENUE_OUTSTANDING);
    const { revenue } = ctx.config;

    if (outstanding <= revenue.outstandingBalanceLimit) {
      return {
        kind: "no_signal",
        reason: `Outstanding ${outstanding} within limit ${revenue.outstandingBalanceLimit}.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.REVENUE_HIGH_OUTSTANDING,
      category: SignalCategory.FINANCIAL,
      title: "Outstanding balance above limit",
      description: `Outstanding patient balances total ${formatValue(outstanding, MetricUnit.CURRENCY)} against a configured limit of ${formatValue(revenue.outstandingBalanceLimit, MetricUnit.CURRENCY)}.`,
      observed: {
        label: "Outstanding balance",
        value: outstanding,
        unit: MetricUnit.CURRENCY,
      },
      threshold: {
        label: "Configured outstanding balance limit",
        value: revenue.outstandingBalanceLimit,
        unit: MetricUnit.CURRENCY,
        direction: ThresholdDirection.UPPER,
      },
      metricsRead: required.metrics.all,
    });
  },
};
