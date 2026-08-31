/**
 * Pattern: forward_schedule_gap
 *
 * Correlation: the chair time offered over the next seven days is booked below
 * the configured minimum. A thin week ahead is a real, actionable finding on its
 * own, so it is reported rather than left unclustered.
 *
 * ## Why this one carries no exclusion guard
 *
 * Every other standalone reading (recall_backlog, outstanding_receivables,
 * acquisition_shortfall) guards on a signal that would make it a duplicate of a
 * richer pattern. This one does not need to, and the reason is the point of the
 * pattern: every other diagnosis in the catalogue describes TODAY. An idle chair
 * this morning and a thin week ahead are separate facts about separate days, and
 * a clinic can easily have one without the other — a fully booked today says
 * nothing about next Thursday. Suppressing this when a today-pattern fires would
 * hide the only warning the engine can give while there is still time to act.
 *
 * ## What is settled, and what is not
 *
 * That the week is under-booked is measured, so it is supported. WHY it is thin —
 * demand that has not arrived yet, recalls that were never worked, or capacity
 * only just opened for booking — is not separable from a single occupancy
 * percentage, so the diagnosis names the gap and stops there.
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

const REQUIRED = [SignalType.SCHEDULING_THIN_WEEK_AHEAD] as const;
const OPTIONAL: readonly SignalType[] = [];

const THIN_WEEK =
  "The chair time offered over the next seven days is booked below the clinic's configured minimum, with the week still ahead.";

export const forwardScheduleGapMatcher: PatternMatcher = {
  pattern: DiagnosisPattern.FORWARD_SCHEDULE_GAP,
  category: SignalCategory.SCHEDULING,
  requiredSignals: REQUIRED,
  optionalSignals: OPTIONAL,
  rule: "Requires the thin-week-ahead signal. Carries no exclusion guard: it describes days that have not happened yet, so it never duplicates a pattern about today.",

  match(ctx: MatcherContext): MatcherOutcome {
    const thin = ctx.signals.get(SignalType.SCHEDULING_THIN_WEEK_AHEAD);
    if (!thin) {
      return notMatched(`Required signal absent: ${absenceSummary(ctx, REQUIRED)}.`);
    }

    const booked = metricValue(ctx, MetricKey.CAPACITY_BOOKED_NEXT_7D);
    const { appointments } = ctx.config.signals;

    const arithmetic: EvidenceNote = {
      slug: "forward.schedule_gap",
      description: `Chair time booked over the next 7 days is ${booked ?? "unavailable"}% against the configured minimum ${appointments.minimumWeekAheadBooked}%. The window is forward-looking, so the shortfall describes capacity that is still sellable rather than capacity already lost.`,
      data: {
        bookedNext7d: booked,
        minimumWeekAheadBooked: appointments.minimumWeekAheadBooked,
      },
    };

    const hypotheses: HypothesisSpec[] = [
      {
        slug: "forward_schedule_gap",
        statement: THIN_WEEK,
        status: "supported",
        supporting: [
          {
            slug: "under-booked-week",
            description: `The next 7 days are ${booked ?? "an unavailable share"}% booked against a configured minimum of ${appointments.minimumWeekAheadBooked}%.`,
            data: { booked, minimum: appointments.minimumWeekAheadBooked },
          },
        ],
      },
    ];

    return emit(ctx, {
      pattern: DiagnosisPattern.FORWARD_SCHEDULE_GAP,
      category: SignalCategory.SCHEDULING,
      title: "Next week is booking below normal",
      summary:
        "The chair time offered over the next seven days is booked below the clinic's configured minimum, identifying capacity that is still open and can still be filled.",
      contributing: [thin],
      requiredSignals: REQUIRED,
      optionalSignals: OPTIONAL,
      hypotheses,
      discriminators: [],
      evidence: [arithmetic],
    });
  },
};
