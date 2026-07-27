/**
 * Signal: clinical.accepted_treatments_unscheduled
 *
 * Business rule: the patient already said yes. Every accepted treatment without
 * a date is a decision that can still cool off, and it is the cheapest possible
 * source of the next appointment.
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

const REQUIRED = [MetricKey.TREATMENT_ACCEPTED_PENDING_SCHEDULING] as const;

export const acceptedTreatmentsUnscheduledEvaluator: SignalEvaluator = {
  type: SignalType.CLINICAL_ACCEPTED_TREATMENTS_UNSCHEDULED,
  category: SignalCategory.CLINICAL,
  requiredMetrics: REQUIRED,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const accepted = required.metrics.value(
      MetricKey.TREATMENT_ACCEPTED_PENDING_SCHEDULING,
    );
    const { treatment } = ctx.config;

    if (accepted <= treatment.acceptedUnscheduledLimit) {
      return {
        kind: "no_signal",
        reason: `${accepted} accepted treatment(s) awaiting scheduling within limit ${treatment.acceptedUnscheduledLimit}.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.CLINICAL_ACCEPTED_TREATMENTS_UNSCHEDULED,
      category: SignalCategory.CLINICAL,
      title: "Accepted treatments not scheduled",
      description: `${accepted} accepted treatment(s) have no appointment scheduled, against a configured limit of ${treatment.acceptedUnscheduledLimit}.`,
      observed: {
        label: "Accepted treatments awaiting scheduling",
        value: accepted,
        unit: MetricUnit.COUNT,
      },
      threshold: {
        label: "Configured accepted-unscheduled limit",
        value: treatment.acceptedUnscheduledLimit,
        unit: MetricUnit.COUNT,
        direction: ThresholdDirection.UPPER,
      },
      metricsRead: required.metrics.all,
    });
  },
};
