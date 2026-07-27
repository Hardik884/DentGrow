/**
 * Pattern: throughput_congestion
 *
 * Correlation: a long queue and a long average wait on the same day are one
 * observation of the same congestion, seen from two angles.
 *
 * Discrimination — capacity-bound vs flow-bound. This is the most cleanly
 * separable discrimination in the phase, and the two answers describe genuinely
 * different problems:
 *
 * - Utilization at or above the near-capacity mark while patients wait: the
 *   constraint is service capacity. There is no slack to absorb the queue.
 * - Utilization below that mark while patients wait: capacity existed and went
 *   unused while people sat in the waiting room. The constraint is arrival
 *   bunching or how appointments are distributed through the day.
 *
 * What remains undetermined: whether the bunching came from patients arriving
 * off-schedule or from appointments overrunning their slots. Both are consistent
 * with every metric available.
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

const REQUIRED = [
  SignalType.OPERATIONAL_QUEUE_BACKLOG,
  SignalType.OPERATIONAL_LONG_WAITING_TIME,
] as const;

const OPTIONAL = [
  SignalType.OPERATIONAL_NEAR_FULL_CAPACITY,
  SignalType.OPERATIONAL_QUEUE_BUILDING_UP,
] as const;

const CAPACITY_BOUND =
  "Waiting time and queue length reflect service capacity being fully consumed by the day's workload.";
const FLOW_BOUND =
  "Waiting time and queue length reflect arrival bunching or appointment distribution through the day rather than exhausted capacity.";
const SERVICE_TIME_VARIANCE =
  "Individual appointments took longer than their scheduled durations, pushing later patients into the queue.";
const ARRIVAL_PUNCTUALITY =
  "Patients arrived outside their scheduled slots, concentrating attendance into part of the day.";

export const throughputCongestionMatcher: PatternMatcher = {
  pattern: DiagnosisPattern.THROUGHPUT_CONGESTION,
  category: SignalCategory.OPERATIONAL,
  requiredSignals: REQUIRED,
  optionalSignals: OPTIONAL,
  rule: "Requires either a queue backlog or a long average waiting time. Near-full capacity and a building queue strengthen it.",

  match(ctx: MatcherContext): MatcherOutcome {
    const present = ctx.signals.present(REQUIRED);
    if (present.length === 0) {
      return notMatched(
        `Neither required signal is present: ${absenceSummary(ctx, REQUIRED)}.`,
      );
    }

    const optionalPresent = ctx.signals.present(OPTIONAL);
    const contributing = [...present, ...optionalPresent];

    const utilization = metricValue(ctx, MetricKey.CAPACITY_CHAIR_UTILIZATION);
    const nearCapacitySignal = ctx.signals.has(
      SignalType.OPERATIONAL_NEAR_FULL_CAPACITY,
    );
    const { capacity } = ctx.config.signals;

    const capacityBound =
      utilization !== undefined && utilization >= capacity.nearCapacityUtilization;
    const flowBound =
      utilization !== undefined && utilization < capacity.nearCapacityUtilization;

    const arithmetic: EvidenceNote = {
      slug: "discrimination.capacity",
      description: `Chair utilization ${utilization === undefined ? "unavailable" : formatValue(utilization, MetricUnit.PERCENTAGE)} against the configured near-capacity mark ${formatValue(capacity.nearCapacityUtilization, MetricUnit.PERCENTAGE)}, with the near-full-capacity signal ${nearCapacitySignal ? "present" : "absent"}. Utilization at or above the mark places the constraint on service capacity; below it, capacity was available while patients waited.`,
      data: {
        utilization,
        nearCapacityUtilization: capacity.nearCapacityUtilization,
        nearCapacitySignal,
        capacityBound,
        flowBound,
      },
    };

    const hypotheses: HypothesisSpec[] = [];
    const discriminators: DiscriminatorDeclaration[] = [
      { key: "CHAIR_UTILIZATION_LEVEL", separates: ["capacity_bound", "flow_bound"] },
      {
        key: "APPOINTMENT_ARRIVAL_TIMES",
        separates: ["arrival_punctuality", "service_time_variance"],
      },
      {
        key: "SERVICE_TIME_DISTRIBUTION",
        separates: ["service_time_variance", "arrival_punctuality"],
      },
    ];

    if (capacityBound) {
      hypotheses.push(
        {
          slug: "capacity_bound",
          statement: CAPACITY_BOUND,
          status: "supported",
          supporting: [
            {
              slug: "utilization-at-capacity",
              description: `Chair utilization is at or above the near-capacity mark, so there was no unused chair time available to absorb the queue.`,
              data: { utilization, nearCapacityUtilization: capacity.nearCapacityUtilization },
            },
          ],
        },
        {
          slug: "flow_bound",
          statement: FLOW_BOUND,
          status: "contradicted",
          contradicting: [
            {
              slug: "no-idle-capacity",
              description: `Chair utilization is at or above the near-capacity mark, so the queue cannot be attributed to capacity that stood idle.`,
              data: { utilization },
            },
          ],
        },
      );
    } else if (flowBound) {
      hypotheses.push(
        {
          slug: "flow_bound",
          statement: FLOW_BOUND,
          status: "supported",
          supporting: [
            {
              slug: "idle-capacity-with-queue",
              description: `Chair utilization is below the near-capacity mark while the queue signals fired, so unused chair time coexisted with patients waiting.`,
              data: { utilization, nearCapacityUtilization: capacity.nearCapacityUtilization },
            },
          ],
        },
        {
          slug: "capacity_bound",
          statement: CAPACITY_BOUND,
          status: "contradicted",
          contradicting: [
            {
              slug: "spare-capacity",
              description: `Chair utilization is below the near-capacity mark, so service capacity was not fully consumed.`,
              data: { utilization },
            },
          ],
        },
      );
    } else {
      hypotheses.push(
        {
          slug: "capacity_bound",
          statement: CAPACITY_BOUND,
          status: "undetermined",
          requires: ["CHAIR_UTILIZATION_LEVEL"],
        },
        {
          slug: "flow_bound",
          statement: FLOW_BOUND,
          status: "undetermined",
          requires: ["CHAIR_UTILIZATION_LEVEL"],
        },
      );
    }

    hypotheses.push(
      {
        slug: "service_time_variance",
        statement: SERVICE_TIME_VARIANCE,
        status: "undetermined",
        requires: ["SERVICE_TIME_DISTRIBUTION"],
      },
      {
        slug: "arrival_punctuality",
        statement: ARRIVAL_PUNCTUALITY,
        status: "undetermined",
        requires: ["APPOINTMENT_ARRIVAL_TIMES"],
      },
    );

    return emit(ctx, {
      pattern: DiagnosisPattern.THROUGHPUT_CONGESTION,
      category: SignalCategory.OPERATIONAL,
      title: "Patients queueing beyond the configured limits",
      summary: `Queue length and average waiting time breached their configured limits on the same day, describing one episode of congestion in the patient flow.`,
      contributing,
      requiredSignals: REQUIRED,
      optionalSignals: OPTIONAL,
      hypotheses,
      discriminators,
      evidence: [arithmetic],
    });
  },
};
