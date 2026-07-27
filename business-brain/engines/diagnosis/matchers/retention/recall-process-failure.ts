/**
 * Pattern: recall_process_failure
 *
 * Correlation: the recall list is overdue and returning volume is falling, while
 * first-time patient acquisition is NOT affected. That combination localises the
 * problem to the recall process rather than to demand for the clinic in general.
 *
 * This pattern is deliberately mutually exclusive with patient_base_erosion: the
 * negative condition on the acquisition signal is what distinguishes them.
 *
 * The negative condition is checked against the trace, not just the signal list.
 * "The acquisition evaluator ran and found nothing" supports this pattern. "The
 * acquisition evaluator could not run" does not — it is missing information, so
 * the pattern still reports, at reduced confidence, and says so in evidence.
 *
 * Discrimination — the acquisition side is measurably unaffected, so the
 * retention reading is supported and the acquisition reading is contradicted. What
 * is NOT separable: whether recalls were never attempted, attempted and did not
 * reach the patient, or reached patients who chose not to return.
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
  SignalType.RETENTION_FOLLOWUP_BACKLOG,
  SignalType.RETENTION_RETURNING_VOLUME_DROPPING,
] as const;

const EXCLUDED = SignalType.ACQUISITION_LOW_NEW_PATIENTS;
const OPTIONAL: readonly SignalType[] = [];

const RECALL_EXECUTION =
  "Patients are not returning because scheduled recalls were not carried through, while first-time acquisition is unaffected.";
const ACQUISITION_DRIVEN =
  "The fall in patient volume is driven by fewer first-time patients reaching the clinic.";
const CONTACT_REACHABILITY =
  "Recall contact attempts were made and did not reach the patients they were addressed to.";
const PATIENT_CHOICE =
  "Patients were reached and chose not to book a further visit.";

export const recallProcessFailureMatcher: PatternMatcher = {
  pattern: DiagnosisPattern.RECALL_PROCESS_FAILURE,
  category: SignalCategory.RETENTION,
  requiredSignals: REQUIRED,
  optionalSignals: OPTIONAL,
  rule: "Requires a follow-up backlog and dropping returning volume, with the low-new-patients signal absent.",

  match(ctx: MatcherContext): MatcherOutcome {
    const present = ctx.signals.present(REQUIRED);
    if (present.length < REQUIRED.length) {
      return notMatched(`Required signals absent: ${absenceSummary(ctx, REQUIRED)}.`);
    }
    if (ctx.signals.has(EXCLUDED)) {
      return notMatched(
        `${EXCLUDED} is present, so the contraction is not localised to the recall process. Reported as ${DiagnosisPattern.PATIENT_BASE_EROSION} instead.`,
      );
    }

    const contributing = [...present];
    const absence = ctx.signals.absence(EXCLUDED);
    const acquisitionMeasured = absence.informative;

    const newPatients = metricValue(ctx, MetricKey.PATIENTS_NEW_TODAY);
    const returning = metricValue(ctx, MetricKey.PATIENTS_RETURNING_TODAY);
    const overdue = metricValue(ctx, MetricKey.FOLLOWUPS_OVERDUE);
    const dueToday = metricValue(ctx, MetricKey.FOLLOWUPS_DUE_TODAY);
    const { patients, followups } = ctx.config.signals;

    const arithmetic: EvidenceNote = {
      slug: "discrimination.recall-localisation",
      description: `Overdue follow-ups ${overdue ?? "unavailable"} against limit ${followups.overdueFollowupLimit}, with ${dueToday ?? "an unavailable number"} due today. Returning patients ${returning ?? "unavailable"} fell past the configured drop threshold ${formatValue(patients.returningVolumeDropRate, MetricUnit.PERCENTAGE)}, while new patients ${newPatients ?? "unavailable"} against minimum ${patients.minimumNewPatientsPerDay} did not breach. The acquisition side is ${acquisitionMeasured ? `measurably unaffected — its evaluator ran and reported no signal` : `NOT measurably unaffected — its evaluator did not reach a verdict (${absence.kind}), so its state is unknown`}.`,
      data: {
        overdue,
        overdueFollowupLimit: followups.overdueFollowupLimit,
        dueToday,
        returning,
        returningVolumeDropRate: patients.returningVolumeDropRate,
        newPatients,
        minimumNewPatientsPerDay: patients.minimumNewPatientsPerDay,
        acquisitionAbsence: absence.kind,
        acquisitionMeasured,
      },
    };

    const hypotheses: HypothesisSpec[] = [
      acquisitionMeasured
        ? {
            slug: "recall_execution",
            statement: RECALL_EXECUTION,
            status: "supported",
            supporting: [
              {
                slug: "localised",
                description: `The overdue recall list is above its configured limit and returning volume fell, while the acquisition evaluator ran and reported no signal. The contraction is therefore measured on the returning side only.`,
                data: { overdue, returning, newPatients },
              },
            ],
          }
        : {
            slug: "recall_execution",
            statement: RECALL_EXECUTION,
            status: "undetermined",
            supporting: [
              {
                slug: "unverified-localisation",
                description: `The overdue recall list is above its configured limit and returning volume fell, but the acquisition evaluator did not reach a verdict (${absence.kind}), so the contraction cannot be confirmed as retention-only. Trace reasoning: "${absence.reason}"`,
                data: { overdue, returning, acquisitionAbsence: absence.kind },
              },
            ],
            requires: ["ACQUISITION_VS_RETENTION_SPLIT"],
          },
      acquisitionMeasured
        ? {
            slug: "acquisition_driven",
            statement: ACQUISITION_DRIVEN,
            status: "contradicted",
            contradicting: [
              {
                slug: "acquisition-unaffected",
                description: `New patient registrations were at or above the configured daily minimum, so a fall in first-time patients does not account for the drop in volume.`,
                data: { newPatients, minimum: patients.minimumNewPatientsPerDay },
              },
            ],
          }
        : {
            slug: "acquisition_driven",
            statement: ACQUISITION_DRIVEN,
            status: "undetermined",
            requires: ["ACQUISITION_VS_RETENTION_SPLIT"],
          },
      {
        slug: "contact_reachability",
        statement: CONTACT_REACHABILITY,
        status: "undetermined",
        requires: ["RECALL_CONTACT_ATTEMPTS"],
      },
      {
        slug: "patient_choice",
        statement: PATIENT_CHOICE,
        status: "undetermined",
        requires: ["POST_VISIT_FEEDBACK", "RECALL_CONTACT_ATTEMPTS"],
      },
    ];

    return emit(ctx, {
      pattern: DiagnosisPattern.RECALL_PROCESS_FAILURE,
      category: SignalCategory.RETENTION,
      title: "Returning volume falling alongside an overdue recall list",
      summary: `Overdue follow-ups were above their configured limit and returning patient volume fell past its drop threshold, while first-time patient registrations did not breach their minimum, localising the measured contraction to returning patients.`,
      contributing,
      requiredSignals: REQUIRED,
      optionalSignals: OPTIONAL,
      hypotheses,
      discriminators: [
        {
          key: "RECALL_CONTACT_ATTEMPTS",
          separates: ["contact_reachability", "recall_execution"],
        },
        {
          key: "POST_VISIT_FEEDBACK",
          separates: ["patient_choice", "contact_reachability"],
        },
        {
          key: "ACQUISITION_VS_RETENTION_SPLIT",
          separates: ["recall_execution", "acquisition_driven"],
        },
      ],
      evidence: [arithmetic],
    });
  },
};
