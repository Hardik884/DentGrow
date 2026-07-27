/**
 * Signal: acquisition.low_new_patients
 *
 * Business rule: a dental practice lives on a steady trickle of first visits.
 * Existing patients eventually finish treatment, so a day with no new
 * registrations is the leading indicator of a shrinking base.
 *
 * Severity is capped at medium by configuration: the threshold is a single
 * patient, so relative breach maths would otherwise report every quiet day as
 * critical.
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

const REQUIRED = [MetricKey.PATIENTS_NEW_TODAY] as const;

export const lowNewPatientsEvaluator: SignalEvaluator = {
  type: SignalType.ACQUISITION_LOW_NEW_PATIENTS,
  category: SignalCategory.RETENTION,
  requiredMetrics: REQUIRED,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const newPatients = required.metrics.value(MetricKey.PATIENTS_NEW_TODAY);
    const { patients } = ctx.config;

    if (newPatients >= patients.minimumNewPatientsPerDay) {
      return {
        kind: "no_signal",
        reason: `${newPatients} new patient(s) at or above minimum ${patients.minimumNewPatientsPerDay}.`,
      };
    }

    return buildThresholdSignal(ctx, {
      type: SignalType.ACQUISITION_LOW_NEW_PATIENTS,
      category: SignalCategory.RETENTION,
      title: "New patient count below minimum",
      description: `${newPatients} new patient(s) registered today against a configured minimum of ${patients.minimumNewPatientsPerDay}.`,
      observed: { label: "New patients today", value: newPatients, unit: MetricUnit.COUNT },
      threshold: {
        label: "Configured minimum new patients per day",
        value: patients.minimumNewPatientsPerDay,
        unit: MetricUnit.COUNT,
        direction: ThresholdDirection.LOWER,
      },
      metricsRead: required.metrics.all,
    });
  },
};
