/**
 * Pattern: collection_gap
 *
 * Correlation: treatment was delivered and the money did not arrive. A rising or
 * already-large receivable book on the same day is the same story seen on the
 * balance sheet rather than in the day's takings.
 *
 * Discrimination — one-off vs systemic, and it is discriminable ONLY through
 * persistence. A single day where collection trailed completions is what a normal
 * billing lag looks like: the payment lands tomorrow. The same gap on three
 * consecutive days is not a lag, because tomorrow kept arriving. So this matcher
 * reads its answer from the history window and, when the window is too short,
 * refuses to guess.
 */

import { DiagnosisPattern, SignalCategory, SignalType } from "../../../../domain";
import type { EvidenceNote, HypothesisSpec } from "../../support/hypothesis-builder";
import { classifyPersistence } from "../../support/persistence";
import { breachMagnitudeOf, signalTypeOf } from "../../support/signal-index";
import {
  absenceSummary,
  emit,
  notMatched,
  type MatcherContext,
  type MatcherOutcome,
  type PatternMatcher,
} from "../types";

const REQUIRED = [SignalType.REVENUE_COLLECTION_LAGGING_COMPLETIONS] as const;

const OPTIONAL = [
  SignalType.REVENUE_HIGH_OUTSTANDING,
  SignalType.REVENUE_OUTSTANDING_INCREASING,
] as const;

const BILLING_LAG =
  "Collection for the treatments completed on this day was recorded after the measured day rather than not at all.";
const SYSTEMIC_PROCESS =
  "Payment collection is not being completed at the point of treatment as a matter of routine practice.";
const PATIENT_BALANCES =
  "A subset of patients left balances unsettled at the point of treatment.";

export const collectionGapMatcher: PatternMatcher = {
  pattern: DiagnosisPattern.COLLECTION_GAP,
  category: SignalCategory.FINANCIAL,
  requiredSignals: REQUIRED,
  optionalSignals: OPTIONAL,
  rule: "Requires collection lagging completions. High outstanding and increasing outstanding strengthen it.",

  match(ctx: MatcherContext): MatcherOutcome {
    const lagging = ctx.signals.get(SignalType.REVENUE_COLLECTION_LAGGING_COMPLETIONS);
    if (!lagging) {
      return notMatched(`Required signal absent: ${absenceSummary(ctx, REQUIRED)}.`);
    }

    const optionalPresent = ctx.signals.present(OPTIONAL);
    const contributing = [lagging, ...optionalPresent];

    // Persistence is the discriminator here, so it is computed before the
    // hypotheses rather than after. The builder recomputes it for the diagnosis
    // itself from the same inputs, so the two always agree.
    const persistence = classifyPersistence({
      window: ctx.window,
      currentDate: ctx.date,
      contributingTypes: contributing.map(signalTypeOf),
      todayBreach: breachMagnitudeOf(lagging),
      config: ctx.config,
    });

    const arithmetic: EvidenceNote = {
      slug: "discrimination.persistence",
      description: `Discrimination for this pattern rests entirely on persistence, classified as ${persistence.persistence}. ${persistence.reasoning} A gap on one day is consistent with same-day billing lag; a gap repeating across consecutive days is not, because the lag would have resolved.`,
      data: {
        persistence: persistence.persistence,
        firedDates: persistence.firedDates,
        unknownDates: persistence.unknownDates,
        consecutiveDays: persistence.consecutiveDays,
        suppliedDays: persistence.suppliedDays,
      },
    };

    const hypotheses: HypothesisSpec[] = [];

    if (persistence.persistence === "transient") {
      hypotheses.push(
        {
          slug: "billing_lag",
          statement: BILLING_LAG,
          status: "supported",
          supporting: [
            {
              slug: "single-day",
              description: `The collection gap fired on this day and on no known day of the supplied window, which is consistent with payment recorded after the measured day.`,
              data: { firedDates: persistence.firedDates },
            },
          ],
        },
        {
          slug: "systemic_process",
          statement: SYSTEMIC_PROCESS,
          status: "contradicted",
          contradicting: [
            {
              slug: "single-day",
              description: `The gap did not occur on any other known day of the window, so the day's collection cannot be attributed to standing practice.`,
              data: { notFiredDates: persistence.notFiredDates },
            },
          ],
        },
      );
    } else if (
      persistence.persistence === "sustained" ||
      persistence.persistence === "worsening"
    ) {
      hypotheses.push(
        {
          slug: "systemic_process",
          statement: SYSTEMIC_PROCESS,
          status: "supported",
          supporting: [
            {
              slug: "consecutive-days",
              description: `The collection gap fired on ${persistence.consecutiveDays} consecutive day(s) including today, so the deferred payment of any single day has not been resolving.`,
              data: {
                consecutiveDays: persistence.consecutiveDays,
                firedDates: persistence.firedDates,
              },
            },
          ],
        },
        {
          slug: "billing_lag",
          statement: BILLING_LAG,
          status: "contradicted",
          contradicting: [
            {
              slug: "consecutive-days",
              description: `A same-day recording lag would clear on the following day. The gap instead repeated across ${persistence.consecutiveDays} consecutive day(s).`,
              data: { consecutiveDays: persistence.consecutiveDays },
            },
          ],
        },
      );
    } else {
      const reason =
        persistence.persistence === "insufficient_history"
          ? `only ${persistence.suppliedDays} history day(s) were supplied, below the minimum ${ctx.config.persistence.minimumHistoryDays}`
          : `the pattern is ${persistence.persistence} across the window, which neither a one-day lag nor a standing process uniquely predicts`;
      hypotheses.push(
        {
          slug: "billing_lag",
          statement: BILLING_LAG,
          status: "undetermined",
          supporting: [
            {
              slug: "window",
              description: `Not separable: ${reason}.`,
              data: { persistence: persistence.persistence },
            },
          ],
          requires: ["COLLECTION_LAG_OVER_TIME"],
        },
        {
          slug: "systemic_process",
          statement: SYSTEMIC_PROCESS,
          status: "undetermined",
          supporting: [
            {
              slug: "window",
              description: `Not separable: ${reason}.`,
              data: { persistence: persistence.persistence },
            },
          ],
          requires: ["COLLECTION_LAG_OVER_TIME"],
        },
      );
    }

    hypotheses.push({
      slug: "patient_balances",
      statement: PATIENT_BALANCES,
      status: "undetermined",
      requires: ["OUTSTANDING_INVOICE_AGEING"],
    });

    return emit(ctx, {
      pattern: DiagnosisPattern.COLLECTION_GAP,
      category: SignalCategory.FINANCIAL,
      title: "Delivered treatment not matched by collection",
      summary: `Treatments were completed on this day while collected revenue stayed below the level those completions imply, so the delivery of care and the receipt of payment diverged.`,
      contributing,
      requiredSignals: REQUIRED,
      optionalSignals: OPTIONAL,
      hypotheses,
      discriminators: [
        {
          key: "COLLECTION_LAG_OVER_TIME",
          separates: ["billing_lag", "systemic_process"],
        },
        {
          key: "OUTSTANDING_INVOICE_AGEING",
          separates: ["patient_balances", "billing_lag"],
        },
        {
          key: "DISCOUNT_AND_WRITEOFF_LOG",
          separates: ["patient_balances", "systemic_process"],
        },
      ],
      evidence: [arithmetic],
    });
  },
};
