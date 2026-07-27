/**
 * Signal: revenue.collection_lagging_completions
 *
 * Business rule: relationship between delivery and cash. Clinical work was
 * finished today, yet the day's collection is still below the minimum — the
 * chair produced value that has not converted into money in the account.
 * Neither metric alone shows this; only the pair does.
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
  MetricKey.TREATMENT_COMPLETED_TODAY,
  MetricKey.REVENUE_COLLECTED_TODAY,
] as const;

export const collectionLaggingCompletionsEvaluator: SignalEvaluator = {
  type: SignalType.REVENUE_COLLECTION_LAGGING_COMPLETIONS,
  category: SignalCategory.FINANCIAL,
  requiredMetrics: REQUIRED,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const completions = required.metrics.value(MetricKey.TREATMENT_COMPLETED_TODAY);
    const collected = required.metrics.value(MetricKey.REVENUE_COLLECTED_TODAY);
    const { revenue } = ctx.config;

    if (completions < revenue.minimumCompletionsForCollectionCheck) {
      return {
        kind: "no_signal",
        reason: `${completions} completed treatment(s) below the minimum ${revenue.minimumCompletionsForCollectionCheck} required for a collection comparison.`,
      };
    }

    if (collected >= revenue.minimumDailyRevenue) {
      return {
        kind: "no_signal",
        reason: `Collected ${collected} at or above minimum ${revenue.minimumDailyRevenue}.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.REVENUE_COLLECTION_LAGGING_COMPLETIONS,
      category: SignalCategory.FINANCIAL,
      title: "Collection lagging completed treatments",
      description: `${completions} treatment(s) were completed today while collection reached ${formatValue(collected, MetricUnit.CURRENCY)}, below the configured daily minimum of ${formatValue(revenue.minimumDailyRevenue, MetricUnit.CURRENCY)}.`,
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
        {
          label: "Treatments completed today",
          value: completions,
          unit: MetricUnit.COUNT,
        },
      ],
      denominator: completions,
      metricsRead: required.metrics.all,
    });
  },
};
