/**
 * Pattern: outstanding_receivables
 *
 * Correlation: the clinic is owed more than its configured limit for work already
 * delivered. Money owed is a real leak whether or not any treatment completed
 * today, so it is reported on its own rather than left unclustered.
 *
 * Reported ONLY when there is no same-day collection-lagging-completions signal.
 * That pairing is the richer collection_gap story (today's delivery not matched by
 * today's collection); guarding on it keeps a standing receivable book and a
 * same-day gap from double-reporting.
 *
 * The size of the balance is supported. WHY it is unpaid — never billed, billed
 * and unsettled, disputed — is not separable from the metric set, so the
 * diagnosis names the balance and stops there.
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

const REQUIRED = [SignalType.REVENUE_HIGH_OUTSTANDING] as const;
const EXCLUDED = SignalType.REVENUE_COLLECTION_LAGGING_COMPLETIONS;
const OPTIONAL = [SignalType.REVENUE_OUTSTANDING_INCREASING] as const;

const BALANCE_OWED =
  "The clinic is owed more than its configured limit for work already delivered.";

export const outstandingReceivablesMatcher: PatternMatcher = {
  pattern: DiagnosisPattern.OUTSTANDING_RECEIVABLES,
  category: SignalCategory.FINANCIAL,
  requiredSignals: REQUIRED,
  optionalSignals: OPTIONAL,
  rule: "Requires a high outstanding balance, with the collection-lagging-completions signal absent (a same-day gap is reported as collection gap instead). Increasing outstanding strengthens it.",

  match(ctx: MatcherContext): MatcherOutcome {
    const high = ctx.signals.get(SignalType.REVENUE_HIGH_OUTSTANDING);
    if (!high) {
      return notMatched(`Required signal absent: ${absenceSummary(ctx, REQUIRED)}.`);
    }
    if (ctx.signals.has(EXCLUDED)) {
      return notMatched(
        `${EXCLUDED} is present, so the balance is part of a same-day collection gap. Reported as ${DiagnosisPattern.COLLECTION_GAP} instead.`,
      );
    }

    const optionalPresent = ctx.signals.present(OPTIONAL);
    const contributing = [high, ...optionalPresent];

    const outstanding = metricValue(ctx, MetricKey.REVENUE_OUTSTANDING);
    const { revenue } = ctx.config.signals;

    const arithmetic: EvidenceNote = {
      slug: "outstanding.balance",
      description: `Outstanding balance ${outstanding === undefined ? "unavailable" : formatValue(outstanding, MetricUnit.CURRENCY)} against the configured limit ${formatValue(revenue.outstandingBalanceLimit, MetricUnit.CURRENCY)}. The receivable book exceeds the limit independent of any same-day collection gap.`,
      data: {
        outstanding,
        outstandingBalanceLimit: revenue.outstandingBalanceLimit,
        increasing: ctx.signals.has(SignalType.REVENUE_OUTSTANDING_INCREASING),
      },
    };

    const hypotheses: HypothesisSpec[] = [
      {
        slug: "balance_owed",
        statement: BALANCE_OWED,
        status: "supported",
        supporting: [
          {
            slug: "over-limit",
            description: `The outstanding balance is above the clinic's configured limit for money owed on delivered work.`,
            data: { outstanding, limit: revenue.outstandingBalanceLimit },
          },
        ],
      },
    ];

    return emit(ctx, {
      pattern: DiagnosisPattern.OUTSTANDING_RECEIVABLES,
      category: SignalCategory.FINANCIAL,
      title: "Money owed for delivered work is above the clinic's limit",
      summary: `The outstanding balance for completed work is above the clinic's configured limit, with ${optionalPresent.length} corroborating signal(s) on the same day.`,
      contributing,
      requiredSignals: REQUIRED,
      optionalSignals: OPTIONAL,
      hypotheses,
      discriminators: [],
      evidence: [arithmetic],
    });
  },
};
