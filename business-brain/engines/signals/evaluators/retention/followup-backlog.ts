/**
 * Signal: retention.followup_backlog
 *
 * Business rule: an overdue follow-up is a patient the clinic already decided
 * needed contact and then did not contact. Unlike most operational numbers this
 * one only grows, so severity is floored at low by configuration: any backlog
 * over the limit stays visible even when it is barely over.
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

const REQUIRED = [MetricKey.FOLLOWUPS_OVERDUE] as const;
const OPTIONAL = [MetricKey.FOLLOWUPS_DUE_TODAY] as const;

export const followupBacklogEvaluator: SignalEvaluator = {
  type: SignalType.RETENTION_FOLLOWUP_BACKLOG,
  category: SignalCategory.RETENTION,
  requiredMetrics: REQUIRED,
  optionalMetrics: OPTIONAL,

  evaluate(ctx: EvaluatorContext): EvaluatorOutcome {
    const required = ctx.metrics.require(...REQUIRED);
    if (!required.ok) return skippedForMissing(required.missing);

    const overdue = required.metrics.value(MetricKey.FOLLOWUPS_OVERDUE);
    const { followups } = ctx.config;

    if (overdue <= followups.overdueFollowupLimit) {
      return {
        kind: "no_signal",
        reason: `${overdue} overdue follow-up(s) within limit ${followups.overdueFollowupLimit}.`,
      };
    }

    const dueToday = ctx.metrics.get(MetricKey.FOLLOWUPS_DUE_TODAY);
    const inputs = dueToday
      ? [{ label: "Follow-ups due today", value: dueToday.value, unit: MetricUnit.COUNT }]
      : [];

    return buildThresholdSignal(ctx, {
      type: SignalType.RETENTION_FOLLOWUP_BACKLOG,
      category: SignalCategory.RETENTION,
      title: "Overdue follow-up backlog",
      description: `${overdue} follow-up(s) are overdue against a configured limit of ${followups.overdueFollowupLimit}.`,
      observed: { label: "Overdue follow-ups", value: overdue, unit: MetricUnit.COUNT },
      threshold: {
        label: "Configured overdue follow-up limit",
        value: followups.overdueFollowupLimit,
        unit: MetricUnit.COUNT,
        direction: ThresholdDirection.UPPER,
      },
      inputs,
      missingOptionalMetrics: dueToday ? 0 : 1,
      metricsRead: dueToday
        ? [...required.metrics.all, dueToday]
        : required.metrics.all,
    });
  },
};
