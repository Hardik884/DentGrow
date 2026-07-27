/**
 * Pattern: patient_base_erosion
 *
 * Correlation: both ends of the patient base are contracting on the same day —
 * fewer first-time patients arriving AND fewer existing patients coming back.
 *
 * Discrimination — acquisition vs retention. The split is measurable, and the
 * important discipline is what happens when BOTH are low: the two hypotheses stay
 * SUPPORTED TOGETHER rather than collapsing into one. This pattern only fires when
 * both signals fired, so "both" is the standing case here, and calling a single
 * winner would be an invention. The single-sided cases are handled by
 * recall_process_failure (retention only) and by the acquisition signal appearing
 * alone, which unclustered_signal carries forward.
 *
 * What remains undetermined: whether demand outside the clinic moved. Nothing in
 * the clinic's own records can see the catchment.
 */

import { DiagnosisPattern, MetricUnit, SignalCategory, SignalType } from "../../../../domain";
import { MetricKey } from "../../../metrics/metric-ids";
import { formatValue } from "../../../signals/support/evidence";
import type { EvidenceNote, HypothesisSpec } from "../../support/hypothesis-builder";
import {
  absenceSummary,
  emit,
  metricValue,
  notMatched,
  type MatcherContext,
  type MatcherOutcome,
  type PatternMatcher,
} from "../types";

const REQUIRED = [
  SignalType.ACQUISITION_LOW_NEW_PATIENTS,
  SignalType.RETENTION_RETURNING_VOLUME_DROPPING,
] as const;

const OPTIONAL = [SignalType.RETENTION_FOLLOWUP_BACKLOG] as const;

const ACQUISITION_DRIVEN =
  "The contraction includes a fall in first-time patients reaching the clinic.";
const RETENTION_DRIVEN =
  "The contraction includes a fall in existing patients returning to the clinic.";
const EXTERNAL_DEMAND =
  "Demand for dental care across the clinic's catchment fell, affecting both first-time and returning patients.";

export const patientBaseErosionMatcher: PatternMatcher = {
  pattern: DiagnosisPattern.PATIENT_BASE_EROSION,
  category: SignalCategory.RETENTION,
  requiredSignals: REQUIRED,
  optionalSignals: OPTIONAL,
  rule: "Requires both low new patients and dropping returning volume. A follow-up backlog strengthens it.",

  match(ctx: MatcherContext): MatcherOutcome {
    const present = ctx.signals.present(REQUIRED);
    if (present.length < REQUIRED.length) {
      return notMatched(`Required signals absent: ${absenceSummary(ctx, REQUIRED)}.`);
    }

    const optionalPresent = ctx.signals.present(OPTIONAL);
    const contributing = [...present, ...optionalPresent];

    const newPatients = metricValue(ctx, MetricKey.PATIENTS_NEW_TODAY);
    const returning = metricValue(ctx, MetricKey.PATIENTS_RETURNING_TODAY);
    const backlog = metricValue(ctx, MetricKey.FOLLOWUPS_OVERDUE);
    const { patients } = ctx.config.signals;

    const arithmetic: EvidenceNote = {
      slug: "discrimination.acquisition-vs-retention",
      description: `New patients ${newPatients ?? "unavailable"} against the daily minimum ${patients.minimumNewPatientsPerDay}, and returning patients ${returning ?? "unavailable"} with the returning-volume drop signal present against a configured drop threshold of ${formatValue(patients.returningVolumeDropRate, MetricUnit.PERCENTAGE)}. Both sides of the patient base breached their thresholds on the same day, so neither is discounted in favour of the other.`,
      data: {
        newPatients,
        minimumNewPatientsPerDay: patients.minimumNewPatientsPerDay,
        returning,
        returningVolumeDropRate: patients.returningVolumeDropRate,
        overdueFollowups: backlog,
      },
    };

    const hypotheses: HypothesisSpec[] = [
      {
        slug: "acquisition_driven",
        statement: ACQUISITION_DRIVEN,
        status: "supported",
        supporting: [
          {
            slug: "new-patients-low",
            description: `New patient registrations were below the configured daily minimum, which is a direct measurement of the acquisition side contracting.`,
            data: { newPatients, minimum: patients.minimumNewPatientsPerDay },
          },
        ],
      },
      {
        slug: "retention_driven",
        statement: RETENTION_DRIVEN,
        status: "supported",
        supporting: [
          {
            slug: "returning-dropping",
            description: `The returning-patient volume fell past its configured drop threshold against the prior period, which is a direct measurement of the retention side contracting.${optionalPresent.length > 0 ? " An overdue follow-up backlog was present on the same day." : ""}`,
            data: { returning, dropThreshold: patients.returningVolumeDropRate, backlog },
          },
        ],
      },
      {
        slug: "external_demand",
        statement: EXTERNAL_DEMAND,
        status: "undetermined",
        requires: ["CATCHMENT_DEMAND_BASELINE", "PATIENT_ACQUISITION_SOURCE"],
      },
    ];

    return emit(ctx, {
      pattern: DiagnosisPattern.PATIENT_BASE_EROSION,
      category: SignalCategory.RETENTION,
      title: "Both sides of the patient base contracting",
      summary: `First-time patient registrations were below the configured daily minimum while returning patient volume fell past its drop threshold on the same day, so the acquisition and retention measurements moved together.`,
      contributing,
      requiredSignals: REQUIRED,
      optionalSignals: OPTIONAL,
      hypotheses,
      discriminators: [
        {
          key: "ACQUISITION_VS_RETENTION_SPLIT",
          separates: ["acquisition_driven", "retention_driven"],
        },
        {
          key: "CATCHMENT_DEMAND_BASELINE",
          separates: ["external_demand", "acquisition_driven"],
        },
        {
          key: "PATIENT_ACQUISITION_SOURCE",
          separates: ["external_demand", "acquisition_driven"],
        },
        {
          key: "LONGER_HISTORY_WINDOW",
          separates: ["external_demand", "retention_driven"],
        },
      ],
      evidence: [arithmetic],
    });
  },
};
