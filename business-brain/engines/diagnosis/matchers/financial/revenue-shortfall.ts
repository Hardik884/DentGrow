/**
 * Pattern: revenue_shortfall
 *
 * Correlation: a day that collected less than a working day should. A thin
 * schedule, an idle chair, or a collection gap on the same day are not separate
 * problems — they are candidate halves of this one.
 *
 * Discrimination — volume vs yield, read from the pair (appointments delivered,
 * treatments completed):
 *
 * - both at or above their thresholds: the clinic did the work and the money did
 *   not arrive. Yield supported, volume contradicted.
 * - both below: less work was delivered, and there was correspondingly less to
 *   collect. Volume supported, yield contradicted.
 * - one below and one not: the two point in opposite directions and cannot be
 *   separated. Both undetermined, with the discriminator named.
 *
 * What remains undetermined regardless: whether the money that did not arrive was
 * never billed, billed at a lower value, discounted, or simply not collected.
 * Nothing in the metric set separates those.
 */

import { DiagnosisPattern, MetricUnit, SignalCategory, SignalType } from "../../../../domain";
import { MetricKey } from "../../../metrics/metric-ids";
import { formatValue } from "../../../signals/support/evidence";
import type { DiscriminatorDeclaration } from "../../support/diagnosis-builder";
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

const REQUIRED = [SignalType.REVENUE_LOW_DAILY_REVENUE] as const;

const OPTIONAL = [
  SignalType.SCHEDULING_LOW_APPOINTMENT_VOLUME,
  SignalType.OPERATIONAL_LOW_CHAIR_UTILIZATION,
  SignalType.REVENUE_COLLECTION_LAGGING_COMPLETIONS,
] as const;

const VOLUME =
  "Revenue was low because less clinical work was delivered on this day than a normal working day delivers.";
const YIELD =
  "Revenue was low because the clinical work delivered on this day was not collected or was billed below its usual value.";
const CASE_MIX =
  "The treatments delivered on this day were weighted toward lower-value procedures than a normal working day.";

export const revenueShortfallMatcher: PatternMatcher = {
  pattern: DiagnosisPattern.REVENUE_SHORTFALL,
  category: SignalCategory.FINANCIAL,
  requiredSignals: REQUIRED,
  optionalSignals: OPTIONAL,
  rule: "Requires low daily revenue. Low appointment volume, low chair utilization, and collection lagging completions strengthen it.",

  match(ctx: MatcherContext): MatcherOutcome {
    const lowRevenue = ctx.signals.get(SignalType.REVENUE_LOW_DAILY_REVENUE);
    if (!lowRevenue) {
      return notMatched(`Required signal absent: ${absenceSummary(ctx, REQUIRED)}.`);
    }

    const optionalPresent = ctx.signals.present(OPTIONAL);
    const contributing = [lowRevenue, ...optionalPresent];

    const appointments = metricValue(ctx, MetricKey.APPOINTMENTS_TOTAL_TODAY);
    const completed = metricValue(ctx, MetricKey.TREATMENT_COMPLETED_TODAY);
    const collected = metricValue(ctx, MetricKey.REVENUE_COLLECTED_TODAY);
    const { appointments: appointmentRules, revenue } = ctx.config.signals;
    const appointmentFloor = appointmentRules.minimumDailyAppointments;
    const completionFloor = revenue.minimumCompletionsForCollectionCheck;

    const bothKnown = appointments !== undefined && completed !== undefined;
    const appointmentsLow = appointments !== undefined && appointments < appointmentFloor;
    const completionsLow = completed !== undefined && completed < completionFloor;
    const workDelivered = bothKnown && !appointmentsLow && !completionsLow;
    const workAbsent = bothKnown && appointmentsLow && completionsLow;

    const arithmetic: EvidenceNote = {
      slug: "discrimination.volume-vs-yield",
      description: `Collected revenue ${collected === undefined ? "unavailable" : formatValue(collected, MetricUnit.CURRENCY)} against the configured daily minimum ${formatValue(revenue.minimumDailyRevenue, MetricUnit.CURRENCY)}. Work delivered measured as ${appointments ?? "an unavailable number of"} appointment(s) against threshold ${appointmentFloor} and ${completed ?? "an unavailable number of"} completed treatment(s) against threshold ${completionFloor}. Both at or above threshold means the work was done and the money was not collected; both below means less work was delivered; a split verdict cannot separate the two.`,
      data: {
        collected,
        minimumDailyRevenue: revenue.minimumDailyRevenue,
        appointments,
        appointmentFloor,
        completed,
        completionFloor,
        appointmentsLow,
        completionsLow,
        workDelivered,
        workAbsent,
      },
    };

    const hypotheses: HypothesisSpec[] = [];
    const discriminators: DiscriminatorDeclaration[] = [
      { key: "DELIVERED_WORK_VOLUME", separates: ["volume", "yield"] },
      { key: "COMPLETED_TREATMENT_MIX", separates: ["case_mix", "yield"] },
      { key: "DISCOUNT_AND_WRITEOFF_LOG", separates: ["case_mix", "yield"] },
    ];

    if (workDelivered) {
      const laggingPresent = ctx.signals.has(
        SignalType.REVENUE_COLLECTION_LAGGING_COMPLETIONS,
      );
      hypotheses.push(
        {
          slug: "yield",
          statement: YIELD,
          status: "supported",
          supporting: [
            {
              slug: "work-delivered",
              description: `Appointments and completed treatments were both at or above their configured thresholds while collected revenue was below its minimum, so the day's clinical output was not matched by its collection.${laggingPresent ? " The collection-lagging-completions signal fired on the same day." : ""}`,
              data: { appointments, completed, collected, laggingPresent },
            },
          ],
        },
        {
          slug: "volume",
          statement: VOLUME,
          status: "contradicted",
          contradicting: [
            {
              slug: "work-delivered",
              description: `Appointment volume and completed treatments were both at or above threshold, which rules out reduced clinical output as the explanation.`,
              data: { appointments, completed },
            },
          ],
        },
      );
    } else if (workAbsent) {
      hypotheses.push(
        {
          slug: "volume",
          statement: VOLUME,
          status: "supported",
          supporting: [
            {
              slug: "work-absent",
              description: `Appointments and completed treatments were both below their configured thresholds, so there was measurably less delivered work available to bill for.`,
              data: { appointments, completed, appointmentFloor, completionFloor },
            },
          ],
        },
        {
          slug: "yield",
          statement: YIELD,
          status: "contradicted",
          contradicting: [
            {
              slug: "work-absent",
              description: `Completed treatments were below threshold, so uncollected delivered work cannot account for the shortfall.`,
              data: { completed, completionFloor },
            },
          ],
        },
      );
    } else {
      const reason = bothKnown
        ? `appointment volume is ${appointmentsLow ? "below" : "at or above"} threshold while completed treatments are ${completionsLow ? "below" : "at or above"} threshold, so the two measurements point in opposite directions`
        : "appointment volume and completed treatments were not both supplied";
      hypotheses.push(
        {
          slug: "volume",
          statement: VOLUME,
          status: "undetermined",
          supporting: [
            {
              slug: "split",
              description: `Not separable: ${reason}.`,
              data: { appointments, completed, appointmentsLow, completionsLow },
            },
          ],
          requires: ["DELIVERED_WORK_VOLUME", "COMPLETED_TREATMENT_MIX"],
        },
        {
          slug: "yield",
          statement: YIELD,
          status: "undetermined",
          supporting: [
            {
              slug: "split",
              description: `Not separable: ${reason}.`,
              data: { appointments, completed, appointmentsLow, completionsLow },
            },
          ],
          requires: ["DELIVERED_WORK_VOLUME", "COMPLETED_TREATMENT_MIX"],
        },
      );
    }

    hypotheses.push({
      slug: "case_mix",
      statement: CASE_MIX,
      status: "undetermined",
      requires: ["COMPLETED_TREATMENT_MIX", "DISCOUNT_AND_WRITEOFF_LOG"],
    });

    return emit(ctx, {
      pattern: DiagnosisPattern.REVENUE_SHORTFALL,
      category: SignalCategory.FINANCIAL,
      title: "Day collected below the working-day minimum",
      summary: `Collected revenue for the day was below the configured minimum for a working day, with ${optionalPresent.length} corroborating signal(s) on the same day.`,
      contributing,
      requiredSignals: REQUIRED,
      optionalSignals: OPTIONAL,
      hypotheses,
      discriminators,
      evidence: [arithmetic],
    });
  },
};
