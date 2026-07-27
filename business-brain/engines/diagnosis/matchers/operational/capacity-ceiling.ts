/**
 * Pattern: capacity_ceiling
 *
 * Correlation: a full chair AND patients waiting is a different story from either
 * alone. It says the day's demand met the clinic's service ceiling.
 *
 * Discrimination — deliberately restrained. That demand met capacity is directly
 * measured, so that hypothesis is supported. But the interesting question, whether
 * a full schedule is turning new patients away, is NOT answerable from these
 * metrics: low new-patient registrations alongside a full chair is a
 * co-occurrence, and nothing records a booking request that was declined. That
 * hypothesis therefore stays undetermined even when the optional acquisition
 * signal is present, and says what would settle it.
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

const QUEUE_SIGNALS = [
  SignalType.OPERATIONAL_QUEUE_BACKLOG,
  SignalType.OPERATIONAL_LONG_WAITING_TIME,
] as const;

const REQUIRED = [
  SignalType.OPERATIONAL_NEAR_FULL_CAPACITY,
  ...QUEUE_SIGNALS,
] as const;

const OPTIONAL = [SignalType.ACQUISITION_LOW_NEW_PATIENTS] as const;

const DEMAND_EXCEEDS_CAPACITY =
  "Patient demand on this day met or exceeded the clinic's available service capacity.";
const CAPACITY_SUPPRESSES_ACQUISITION =
  "New patient intake is constrained by the absence of bookable capacity rather than by a lack of enquiries.";
const SCHEDULE_OVERBOOKING =
  "Scheduled appointment durations are shorter than the time appointments actually take, so a full schedule produces a queue.";

export const capacityCeilingMatcher: PatternMatcher = {
  pattern: DiagnosisPattern.CAPACITY_CEILING,
  category: SignalCategory.OPERATIONAL,
  requiredSignals: REQUIRED,
  optionalSignals: OPTIONAL,
  rule: "Requires near-full capacity together with either a queue backlog or a long average waiting time. Low new patients strengthens it.",

  match(ctx: MatcherContext): MatcherOutcome {
    const nearFull = ctx.signals.get(SignalType.OPERATIONAL_NEAR_FULL_CAPACITY);
    if (!nearFull) {
      return notMatched(
        `Required signal absent: ${absenceSummary(ctx, [SignalType.OPERATIONAL_NEAR_FULL_CAPACITY])}.`,
      );
    }
    const queueSignals = ctx.signals.present(QUEUE_SIGNALS);
    if (queueSignals.length === 0) {
      return notMatched(
        `Near-full capacity is present but no queue signal is: ${absenceSummary(ctx, QUEUE_SIGNALS)}.`,
      );
    }

    const optionalPresent = ctx.signals.present(OPTIONAL);
    const contributing = [nearFull, ...queueSignals, ...optionalPresent];

    const utilization = metricValue(ctx, MetricKey.CAPACITY_CHAIR_UTILIZATION);
    const openSlots = metricValue(ctx, MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY);
    const newPatients = metricValue(ctx, MetricKey.PATIENTS_NEW_TODAY);
    const lowNewPatients = ctx.signals.has(SignalType.ACQUISITION_LOW_NEW_PATIENTS);
    const { capacity, patients } = ctx.config.signals;

    const arithmetic: EvidenceNote = {
      slug: "discrimination.ceiling",
      description: `Chair utilization ${utilization === undefined ? "unavailable" : formatValue(utilization, MetricUnit.PERCENTAGE)} against the near-capacity mark ${formatValue(capacity.nearCapacityUtilization, MetricUnit.PERCENTAGE)}, with ${openSlots ?? "an unavailable number of"} slot(s) remaining against minimum ${capacity.minimumAvailableSlots}, while ${queueSignals.length} queue signal(s) fired. New patients ${newPatients ?? "unavailable"} against minimum ${patients.minimumNewPatientsPerDay}; the low-new-patient signal is ${lowNewPatients ? "present" : "absent"}. Co-occurrence of a full schedule and low new registrations is not evidence that the schedule caused the registrations: no measurement records a booking request that was turned away.`,
      data: {
        utilization,
        nearCapacityUtilization: capacity.nearCapacityUtilization,
        openSlots,
        minimumAvailableSlots: capacity.minimumAvailableSlots,
        queueSignals: queueSignals.length,
        newPatients,
        lowNewPatients,
      },
    };

    const hypotheses: HypothesisSpec[] = [
      {
        slug: "demand_exceeds_capacity",
        statement: DEMAND_EXCEEDS_CAPACITY,
        status: "supported",
        supporting: [
          {
            slug: "full-plus-queue",
            description: `The schedule reached the near-capacity mark and patients were still queueing, which is a direct measurement of demand meeting the service ceiling.`,
            data: { utilization, openSlots, queueSignals: queueSignals.length },
          },
        ],
      },
      {
        slug: "capacity_suppresses_acquisition",
        statement: CAPACITY_SUPPRESSES_ACQUISITION,
        status: "undetermined",
        supporting: lowNewPatients
          ? [
              {
                slug: "co-occurrence",
                description: `New patient registrations were below the daily minimum on the same day the schedule was full. This is a co-occurrence: the metrics cannot show whether any patient tried to book and could not.`,
                data: { newPatients, lowNewPatients },
              },
            ]
          : undefined,
        requires: ["BOOKING_CHANNEL_ACTIVITY", "PATIENT_ACQUISITION_SOURCE"],
      },
      {
        slug: "schedule_overbooking",
        statement: SCHEDULE_OVERBOOKING,
        status: "undetermined",
        requires: ["SERVICE_TIME_DISTRIBUTION"],
      },
    ];

    return emit(ctx, {
      pattern: DiagnosisPattern.CAPACITY_CEILING,
      category: SignalCategory.OPERATIONAL,
      title: "Demand meeting the clinic's service ceiling",
      summary: `The schedule was at or above the configured near-capacity mark while queue signals fired on the same day, describing a day whose demand reached the limit of available chair time.`,
      contributing,
      requiredSignals: REQUIRED,
      optionalSignals: OPTIONAL,
      hypotheses,
      discriminators: [
        {
          key: "BOOKING_CHANNEL_ACTIVITY",
          separates: ["capacity_suppresses_acquisition", "demand_exceeds_capacity"],
        },
        {
          key: "SERVICE_TIME_DISTRIBUTION",
          separates: ["schedule_overbooking", "demand_exceeds_capacity"],
        },
        {
          key: "PATIENT_ACQUISITION_SOURCE",
          separates: ["capacity_suppresses_acquisition", "demand_exceeds_capacity"],
        },
      ],
      evidence: [arithmetic],
    });
  },
};
