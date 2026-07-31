/**
 * Pattern: pipeline_conversion_failure
 *
 * Correlation: planned treatment is sitting in the plan and not reaching a
 * chair. A stalled pipeline signal says this directly; a large pending value
 * together with a queue of planned treatments whose patients have no next visit
 * booked says the same thing from two measurements.
 *
 * Nothing here knows the patient agreed. `planned` is a plan the clinic
 * recorded, not consent the patient gave, and the booking check is per patient
 * rather than per treatment. The wording throughout stays inside those limits.
 *
 * Discrimination — was there room for the work? This is separable, because the
 * clinic's own utilization answers it. Idle chairs alongside an unscheduled
 * treatment book rule out "no capacity for it": the capacity was there and the
 * work was not booked into it. A full schedule supports the opposite reading.
 *
 * What remains undetermined: whether the patient deferred or the clinic never
 * offered a date, and whether cost is holding plans back. Both need the treatment
 * plans themselves, not the daily aggregate.
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

const PIPELINE_STALLED = SignalType.CLINICAL_PIPELINE_STALLED;
const PAIR = [
  SignalType.CLINICAL_LARGE_PENDING_TREATMENT_VALUE,
  SignalType.CLINICAL_ACCEPTED_TREATMENTS_UNSCHEDULED,
] as const;

const REQUIRED = [PIPELINE_STALLED, ...PAIR] as const;
const OPTIONAL = [SignalType.OPERATIONAL_LOW_CHAIR_UTILIZATION] as const;

const NO_AVAILABLE_CAPACITY =
  "Patients with planned treatment have no next visit booked because the schedule had no capacity available to offer them.";
const BOOKING_FOLLOW_THROUGH =
  "Patients with planned treatment left without a next visit booked even though schedule capacity was available.";
const PATIENT_DEFERRAL =
  "Patients with planned treatment deferred committing to an appointment date.";
const COST_BARRIER =
  "Treatment cost is holding back booking for a subset of the planned treatments.";

export const pipelineConversionFailureMatcher: PatternMatcher = {
  pattern: DiagnosisPattern.PIPELINE_CONVERSION_FAILURE,
  category: SignalCategory.CLINICAL,
  requiredSignals: REQUIRED,
  optionalSignals: OPTIONAL,
  rule: "Requires either a stalled pipeline, or both a large pending treatment value and planned treatments whose patients have no next visit booked. Low chair utilization strengthens it.",

  match(ctx: MatcherContext): MatcherOutcome {
    const stalled = ctx.signals.get(PIPELINE_STALLED);
    const pair = ctx.signals.present(PAIR);
    if (!stalled && pair.length < PAIR.length) {
      return notMatched(
        `Neither the stalled-pipeline signal nor the full pending/unscheduled pair is present: ${absenceSummary(ctx, REQUIRED)}.`,
      );
    }

    const optionalPresent = ctx.signals.present(OPTIONAL);
    const contributing = [...(stalled ? [stalled] : []), ...pair, ...optionalPresent];

    const utilization = metricValue(ctx, MetricKey.CAPACITY_CHAIR_UTILIZATION);
    const openSlots = metricValue(ctx, MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY);
    const acceptedPending = metricValue(
      ctx,
      MetricKey.TREATMENT_ACCEPTED_PENDING_SCHEDULING,
    );
    const pendingValue = metricValue(ctx, MetricKey.REVENUE_PENDING_TREATMENT_VALUE);
    const idleCapacity = ctx.signals.has(SignalType.OPERATIONAL_LOW_CHAIR_UTILIZATION);
    const nearFull = ctx.signals.has(SignalType.OPERATIONAL_NEAR_FULL_CAPACITY);
    const { capacity } = ctx.config.signals;

    const arithmetic: EvidenceNote = {
      slug: "discrimination.capacity-for-pipeline",
      description: `Planned treatments with no next visit booked ${acceptedPending ?? "unavailable"}, against ${pendingValue === undefined ? "an unavailable" : formatValue(pendingValue, MetricUnit.CURRENCY)} of planned and in-progress treatment value, chair utilization ${utilization === undefined ? "unavailable" : formatValue(utilization, MetricUnit.PERCENTAGE)} and ${openSlots ?? "an unavailable number of"} open slot(s). The low-utilization signal is ${idleCapacity ? "present" : "absent"} and the near-full-capacity signal is ${nearFull ? "present" : "absent"}.`,
      data: {
        acceptedPending,
        pendingValue,
        utilization,
        openSlots,
        minimumChairUtilization: capacity.minimumChairUtilization,
        idleCapacity,
        nearFull,
      },
    };

    const hypotheses: HypothesisSpec[] = [];

    if (idleCapacity) {
      hypotheses.push(
        {
          slug: "booking_follow_through",
          statement: BOOKING_FOLLOW_THROUGH,
          status: "supported",
          supporting: [
            {
              slug: "idle-capacity",
              description: `Chair utilization was below its configured minimum on the same day the planned-treatment book was above its limit, so schedule capacity existed while those patients left with nothing booked.`,
              data: { utilization, openSlots, acceptedPending },
            },
          ],
        },
        {
          slug: "no_available_capacity",
          statement: NO_AVAILABLE_CAPACITY,
          status: "contradicted",
          contradicting: [
            {
              slug: "idle-capacity",
              description: `Chair utilization was below its configured minimum, so a lack of schedule capacity does not account for the missing next visits.`,
              data: { utilization, openSlots },
            },
          ],
        },
      );
    } else if (nearFull) {
      hypotheses.push(
        {
          slug: "no_available_capacity",
          statement: NO_AVAILABLE_CAPACITY,
          status: "supported",
          supporting: [
            {
              slug: "near-full",
              description: `The schedule was at or above the near-capacity mark, so there was little bookable time to offer those patients.`,
              data: { utilization, openSlots },
            },
          ],
        },
        {
          slug: "booking_follow_through",
          statement: BOOKING_FOLLOW_THROUGH,
          status: "contradicted",
          contradicting: [
            {
              slug: "near-full",
              description: `Available capacity was at or below its configured minimum, so unused bookable time does not account for the missing next visits.`,
              data: { utilization, openSlots },
            },
          ],
        },
      );
    } else {
      hypotheses.push(
        {
          slug: "no_available_capacity",
          statement: NO_AVAILABLE_CAPACITY,
          status: "undetermined",
          requires: ["CHAIR_UTILIZATION_LEVEL"],
        },
        {
          slug: "booking_follow_through",
          statement: BOOKING_FOLLOW_THROUGH,
          status: "undetermined",
          requires: ["CHAIR_UTILIZATION_LEVEL", "PROVIDER_AVAILABILITY_ROSTER"],
        },
      );
    }

    hypotheses.push(
      {
        slug: "patient_deferral",
        statement: PATIENT_DEFERRAL,
        status: "undetermined",
        requires: ["PENDING_TREATMENT_AGE"],
      },
      {
        slug: "cost_barrier",
        statement: COST_BARRIER,
        status: "undetermined",
        requires: ["TREATMENT_COST_BARRIER", "PENDING_TREATMENT_COMPOSITION"],
      },
    );

    return emit(ctx, {
      pattern: DiagnosisPattern.PIPELINE_CONVERSION_FAILURE,
      category: SignalCategory.CLINICAL,
      title: "Planned treatment not reaching the schedule",
      summary: `Planned treatment was above its configured limits while the patients carrying it had no next visit booked, so the treatment plans and the appointment book diverged.`,
      contributing,
      requiredSignals: REQUIRED,
      optionalSignals: OPTIONAL,
      hypotheses,
      discriminators: [
        {
          key: "CHAIR_UTILIZATION_LEVEL",
          separates: ["no_available_capacity", "booking_follow_through"],
        },
        {
          key: "PENDING_TREATMENT_AGE",
          separates: ["patient_deferral", "booking_follow_through"],
        },
        {
          key: "PENDING_TREATMENT_COMPOSITION",
          separates: ["cost_barrier", "no_available_capacity"],
        },
        {
          key: "TREATMENT_COST_BARRIER",
          separates: ["cost_barrier", "patient_deferral"],
        },
      ],
      evidence: [arithmetic],
    });
  },
};
