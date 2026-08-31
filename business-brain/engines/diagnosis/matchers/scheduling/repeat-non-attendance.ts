/**
 * Pattern: repeat_non_attendance
 *
 * Correlation: two or more patients each missed 2+ appointments in the trailing
 * window, so the clinic's non-attendance is concentrated rather than spread.
 *
 * ## Why it emits `patient_level_pattern` rather than a slug of its own
 *
 * Because it is the same cause. `schedule_attrition` already names
 * `patient_level_pattern` — "non-attendance is concentrated among patients who
 * have missed before" — and already has a strategy, a workflow and an action
 * plan keyed to it. What differs here is the ROUTE to settling it, not the
 * finding: attrition reaches that conclusion by inspecting individual
 * appointment rows through the entity context port, and this reaches it from a
 * measured count.
 *
 * Reusing the slug means the Strategy Engine's dedupe-by-slug does the rest: if
 * both diagnoses settle it, the clinic is told once. A new slug would have
 * produced two near-identical recommendations for one problem.
 *
 * ## Why there is no guard against schedule_attrition
 *
 * Every other standalone reading suppresses itself when a richer pattern tells
 * the same story. This one deliberately does not, because the richer pattern
 * cannot be relied on to tell it: schedule_attrition only settles
 * `patient_level_pattern` when entity rows are available, and a deployment with
 * no `DiagnosisContextPort` never settles it at all. Suppressing a measurement
 * that is always available in favour of one that might not run would reintroduce
 * exactly the blind spot this pattern exists to close — a clinic under its
 * no-show rate threshold, with three patients missing repeatedly, seeing nothing.
 *
 * Both landing on SCHEDULING is harmless: the Constraint Engine merges them into
 * one bottleneck, and the shared slug collapses them into one piece of advice.
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

const REQUIRED = [SignalType.SCHEDULING_REPEAT_NON_ATTENDANCE] as const;
const OPTIONAL: readonly SignalType[] = [];

const CONCENTRATED =
  "Missed appointments are concentrated in a few patients who have each failed to attend more than once, rather than spread across the patient base.";

export const repeatNonAttendanceMatcher: PatternMatcher = {
  pattern: DiagnosisPattern.REPEAT_NON_ATTENDANCE,
  category: SignalCategory.SCHEDULING,
  requiredSignals: REQUIRED,
  optionalSignals: OPTIONAL,
  rule: "Requires the repeat-non-attendance signal. No exclusion guard: schedule_attrition can only settle this cause when entity rows are available, so suppressing the measured route would leave it unsettled wherever no context port is wired up.",

  match(ctx: MatcherContext): MatcherOutcome {
    const concentrated = ctx.signals.get(SignalType.SCHEDULING_REPEAT_NON_ATTENDANCE);
    if (!concentrated) {
      return notMatched(`Required signal absent: ${absenceSummary(ctx, REQUIRED)}.`);
    }

    const repeat = metricValue(ctx, MetricKey.SCHEDULING_REPEAT_NON_ATTENDERS_30D);
    const rate = metricValue(ctx, MetricKey.SCHEDULING_NO_SHOW_RATE_30D);
    const { appointments } = ctx.config.signals;

    const arithmetic: EvidenceNote = {
      slug: "attrition.concentration",
      description:
        `${repeat ?? "An unavailable number of"} patients each missed 2 or more appointments over the trailing window, against a configured limit of ${appointments.repeatNonAttenderLimit}` +
        (rate === undefined
          ? "."
          : `, with an overall no-show rate of ${rate}%. The rate measures how much attrition there is; this measures whether it is concentrated, and the two can disagree.`),
      data: {
        repeatNonAttenders: repeat,
        repeatNonAttenderLimit: appointments.repeatNonAttenderLimit,
        noShowRate30d: rate,
      },
    };

    const hypotheses: HypothesisSpec[] = [
      {
        // Deliberately the same slug schedule_attrition uses — see the header.
        slug: "patient_level_pattern",
        statement: CONCENTRATED,
        status: "supported",
        supporting: [
          {
            slug: "repeat-non-attenders",
            description: `${repeat ?? "An unavailable number of"} patients have each missed more than one appointment in the last 30 days, at or above the configured limit of ${appointments.repeatNonAttenderLimit}.`,
            data: { repeat, limit: appointments.repeatNonAttenderLimit },
          },
        ],
      },
    ];

    return emit(ctx, {
      pattern: DiagnosisPattern.REPEAT_NON_ATTENDANCE,
      category: SignalCategory.SCHEDULING,
      title: "Missed appointments concentrated in a few patients",
      summary:
        "Several patients have each failed to attend more than once over the last 30 days, identifying the clinic's non-attendance as concentrated in a small group rather than spread across the patient base.",
      contributing: [concentrated],
      requiredSignals: REQUIRED,
      optionalSignals: OPTIONAL,
      hypotheses,
      discriminators: [],
      evidence: [arithmetic],
    });
  },
};
