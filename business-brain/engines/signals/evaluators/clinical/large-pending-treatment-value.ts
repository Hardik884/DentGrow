/**
 * Signal: clinical.large_pending_treatment_value
 *
 * Business rule: treatment that has been planned but not yet delivered is the
 * clinic's forward book. Past the configured limit, the size of that book is
 * itself the observation.
 *
 * Not "accepted": `planned` records what the clinic wrote down, not what the
 * patient agreed to, and the schema cannot tell the two apart.
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

const REQUIRED = [MetricKey.REVENUE_PENDING_TREATMENT_VALUE] as const;

export const largePendingTreatmentValueEvaluator: SignalEvaluator = {
  type: SignalType.CLINICAL_LARGE_PENDING_TREATMENT_VALUE,
  category: SignalCategory.CLINICAL,
  requiredMetrics: REQUIRED,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const pending = required.metrics.value(MetricKey.REVENUE_PENDING_TREATMENT_VALUE);
    const { treatment } = ctx.config;

    if (pending <= treatment.pendingTreatmentValueLimit) {
      return {
        kind: "no_signal",
        reason: `Pending treatment value ${pending} within limit ${treatment.pendingTreatmentValueLimit}.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.CLINICAL_LARGE_PENDING_TREATMENT_VALUE,
      category: SignalCategory.CLINICAL,
      title: "Large pending treatment value",
      description: `Planned but undelivered treatment is worth ${formatValue(pending, MetricUnit.CURRENCY)} against a configured limit of ${formatValue(treatment.pendingTreatmentValueLimit, MetricUnit.CURRENCY)}.`,
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
      metricsRead: required.metrics.all,
    });
  },
};
