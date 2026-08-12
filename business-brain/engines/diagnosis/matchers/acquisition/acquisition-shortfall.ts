/**
 * Pattern: acquisition_shortfall
 *
 * Correlation: fewer first-time patients registered than the clinic's own
 * configured daily minimum. A single directly-measured fact, not a correlation of
 * two — so it is reported on its own rather than left unclustered.
 *
 * Reported ONLY when returning-patient volume did not also drop. A simultaneous
 * fall on both the new and returning sides is a broader contraction that
 * patient_base_erosion localises; guarding on that signal keeps the two from
 * double-reporting the same story.
 *
 * The measured shortfall is supported. WHY new patients are down — referrals,
 * marketing reach, seasonality — is not separable from the metric set, so no
 * cause is asserted and the diagnosis names only what it can see.
 */

import { DiagnosisPattern, SignalCategory, SignalType } from "../../../../domain";
import { MetricKey } from "../../../metrics/metric-ids";
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

const REQUIRED = [SignalType.ACQUISITION_LOW_NEW_PATIENTS] as const;
const EXCLUDED = SignalType.RETENTION_RETURNING_VOLUME_DROPPING;
const OPTIONAL: readonly SignalType[] = [];

const SHORTFALL =
  "Fewer first-time patients registered than the clinic's configured daily minimum, while returning-patient volume held.";

export const acquisitionShortfallMatcher: PatternMatcher = {
  pattern: DiagnosisPattern.ACQUISITION_SHORTFALL,
  category: SignalCategory.RETENTION,
  requiredSignals: REQUIRED,
  optionalSignals: OPTIONAL,
  rule: "Requires low new patients, with the returning-volume-dropping signal absent (a fall on both sides is reported as patient base erosion instead).",

  match(ctx: MatcherContext): MatcherOutcome {
    const low = ctx.signals.get(SignalType.ACQUISITION_LOW_NEW_PATIENTS);
    if (!low) {
      return notMatched(`Required signal absent: ${absenceSummary(ctx, REQUIRED)}.`);
    }
    if (ctx.signals.has(EXCLUDED)) {
      return notMatched(
        `${EXCLUDED} is present, so the contraction is not isolated to first-time patients. Reported as ${DiagnosisPattern.PATIENT_BASE_EROSION} instead.`,
      );
    }

    const newPatients = metricValue(ctx, MetricKey.PATIENTS_NEW_TODAY);
    const returning = metricValue(ctx, MetricKey.PATIENTS_RETURNING_TODAY);
    const { patients } = ctx.config.signals;

    const arithmetic: EvidenceNote = {
      slug: "acquisition.shortfall",
      description: `New patient registrations ${newPatients ?? "unavailable"} against the configured daily minimum ${patients.minimumNewPatientsPerDay}. Returning-patient volume ${returning ?? "unavailable"} registered no drop, so the shortfall is measured on the first-time side only.`,
      data: {
        newPatients,
        minimumNewPatientsPerDay: patients.minimumNewPatientsPerDay,
        returning,
      },
    };

    const hypotheses: HypothesisSpec[] = [
      {
        slug: "acquisition_shortfall",
        statement: SHORTFALL,
        status: "supported",
        supporting: [
          {
            slug: "below-minimum",
            description: `New patient registrations were below the configured daily minimum of ${patients.minimumNewPatientsPerDay}, while returning-patient volume did not fall.`,
            data: { newPatients, minimum: patients.minimumNewPatientsPerDay },
          },
        ],
      },
    ];

    return emit(ctx, {
      pattern: DiagnosisPattern.ACQUISITION_SHORTFALL,
      category: SignalCategory.RETENTION,
      title: "Fewer new patients than the clinic's normal",
      summary: `New patient registrations for the day were below the clinic's configured daily minimum, with returning-patient volume unaffected, isolating the shortfall to first-time patients.`,
      contributing: [low],
      requiredSignals: REQUIRED,
      optionalSignals: OPTIONAL,
      hypotheses,
      discriminators: [],
      evidence: [arithmetic],
    });
  },
};
