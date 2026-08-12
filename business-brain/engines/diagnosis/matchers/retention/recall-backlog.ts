/**
 * Pattern: recall_backlog
 *
 * Correlation: the overdue recall list is above the clinic's configured limit. An
 * overdue recall is a patient due back who has not been brought back, which is a
 * real retention leak on its own — so it is reported rather than left unclustered.
 *
 * Reported ONLY when returning-patient volume did not also drop. When it has, the
 * backlog is part of the sharper recall_process_failure / patient_base_erosion
 * story; guarding on that signal keeps the two from double-reporting.
 *
 * The size of the backlog is supported. WHY recalls are overdue — never
 * attempted, attempted and unreachable, reached and declined — is not separable
 * from the metric set, so the diagnosis names the backlog and stops there.
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

const REQUIRED = [SignalType.RETENTION_FOLLOWUP_BACKLOG] as const;
const EXCLUDED = SignalType.RETENTION_RETURNING_VOLUME_DROPPING;
const OPTIONAL: readonly SignalType[] = [];

const BACKLOG =
  "The overdue recall list is above the clinic's configured limit, while returning-patient volume held.";

export const recallBacklogMatcher: PatternMatcher = {
  pattern: DiagnosisPattern.RECALL_BACKLOG,
  category: SignalCategory.RETENTION,
  requiredSignals: REQUIRED,
  optionalSignals: OPTIONAL,
  rule: "Requires a follow-up backlog, with the returning-volume-dropping signal absent (a fall in returning volume is reported as recall process failure instead).",

  match(ctx: MatcherContext): MatcherOutcome {
    const backlog = ctx.signals.get(SignalType.RETENTION_FOLLOWUP_BACKLOG);
    if (!backlog) {
      return notMatched(`Required signal absent: ${absenceSummary(ctx, REQUIRED)}.`);
    }
    if (ctx.signals.has(EXCLUDED)) {
      return notMatched(
        `${EXCLUDED} is present, so the backlog is part of a measured contraction in returning volume. Reported as ${DiagnosisPattern.RECALL_PROCESS_FAILURE} instead.`,
      );
    }

    const overdue = metricValue(ctx, MetricKey.FOLLOWUPS_OVERDUE);
    const dueToday = metricValue(ctx, MetricKey.FOLLOWUPS_DUE_TODAY);
    const { followups } = ctx.config.signals;

    const arithmetic: EvidenceNote = {
      slug: "recall.backlog",
      description: `Overdue follow-ups ${overdue ?? "unavailable"} against the configured limit ${followups.overdueFollowupLimit}, with ${dueToday ?? "an unavailable number"} due today. The backlog exceeds the limit independent of any measured drop in returning volume.`,
      data: {
        overdue,
        overdueFollowupLimit: followups.overdueFollowupLimit,
        dueToday,
      },
    };

    const hypotheses: HypothesisSpec[] = [
      {
        slug: "recall_backlog",
        statement: BACKLOG,
        status: "supported",
        supporting: [
          {
            slug: "over-limit",
            description: `The overdue recall list is above the clinic's configured limit of ${followups.overdueFollowupLimit}, while returning-patient volume did not fall.`,
            data: { overdue, limit: followups.overdueFollowupLimit },
          },
        ],
      },
    ];

    return emit(ctx, {
      pattern: DiagnosisPattern.RECALL_BACKLOG,
      category: SignalCategory.RETENTION,
      title: "Overdue recall list above the clinic's limit",
      summary: `Overdue follow-ups were above the clinic's configured limit while returning-patient volume did not fall, isolating the finding to an unworked recall backlog.`,
      contributing: [backlog],
      requiredSignals: REQUIRED,
      optionalSignals: OPTIONAL,
      hypotheses,
      discriminators: [],
      evidence: [arithmetic],
    });
  },
};
