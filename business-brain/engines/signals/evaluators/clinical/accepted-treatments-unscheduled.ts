/**
 * Signal: clinical.accepted_treatments_unscheduled
 *
 * Business rule: a treatment plan exists and the patient has nothing in the
 * book. That patient is the cheapest possible source of the next appointment,
 * and a plan with no return visit can still cool off.
 *
 * The identifier says "accepted" for compatibility; the measurement does not.
 * `planned` is not a record of consent — the schema has no `presented` or
 * `declined` state — and "unscheduled" is resolved at the PATIENT level, because
 * no treatment-to-appointment link exists. Every user-facing string below is
 * worded to claim only those two things, so nothing here should be re-phrased
 * back into the language of acceptance or of a scheduled treatment.
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
        reason: `${accepted} planned treatment(s) whose patient has no next visit booked, within limit ${treatment.acceptedUnscheduledLimit}.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.CLINICAL_ACCEPTED_TREATMENTS_UNSCHEDULED,
      category: SignalCategory.CLINICAL,
      title: "Planned treatment with no next visit booked",
      description: `${accepted} planned treatment(s) belong to patients with no upcoming appointment, against a configured limit of ${treatment.acceptedUnscheduledLimit}. Booking is read per patient, not per treatment, and a plan being recorded is not a record that the patient agreed to it.`,
      observed: {
        label: "Planned treatments whose patient has no next visit booked",
        value: accepted,
        unit: MetricUnit.COUNT,
      },
      threshold: {
        label: "Configured limit for planned treatments with no next visit",
        value: treatment.acceptedUnscheduledLimit,
        unit: MetricUnit.COUNT,
        direction: ThresholdDirection.UPPER,
      },
      metricsRead: required.metrics.all,
    });
  },
};
