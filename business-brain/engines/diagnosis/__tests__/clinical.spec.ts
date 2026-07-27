import { describe, expect, it } from "vitest";

import { DiagnosisPattern } from "../../../domain";
import { MetricKey } from "../../metrics/metric-ids";
import {
  diagnoseMetrics,
  discriminatorSlugs,
  hypothesis,
  patternsOf,
  pick,
  statuses,
} from "./fixtures/diagnose-harness";
import {
  CONGESTION_CAPACITY_BOUND,
  DEMAND_SUPPLY_WITH_PENDING,
  HEALTHY,
} from "./fixtures/run-fixtures";

describe("pipeline_conversion_failure", () => {
  it("contradicts a capacity explanation when chairs sat idle", () => {
    const diagnosis = pick(
      diagnoseMetrics(DEMAND_SUPPLY_WITH_PENDING),
      DiagnosisPattern.PIPELINE_CONVERSION_FAILURE,
    );
    expect(statuses(diagnosis)).toEqual({
      booking_follow_through: "supported",
      no_available_capacity: "contradicted",
      patient_deferral: "undetermined",
      cost_barrier: "undetermined",
    });
    expect(hypothesis(diagnosis, "patient_deferral").requiredData[0]).toContain(
      "Days elapsed since acceptance",
    );
  });

  it("supports a capacity explanation when the schedule was full", () => {
    const fullScheduleWithBacklog = {
      ...CONGESTION_CAPACITY_BOUND,
      [MetricKey.REVENUE_PENDING_TREATMENT_VALUE]: 180_000,
      [MetricKey.TREATMENT_ACCEPTED_PENDING_SCHEDULING]: 9,
    };
    const diagnosis = pick(
      diagnoseMetrics(fullScheduleWithBacklog),
      DiagnosisPattern.PIPELINE_CONVERSION_FAILURE,
    );
    expect(statuses(diagnosis)).toMatchObject({
      no_available_capacity: "supported",
      booking_follow_through: "contradicted",
    });
  });

  it("matches on the pending/unscheduled pair without the stalled signal", () => {
    // A full schedule keeps the pipeline-stalled evaluator quiet, so the pair is
    // the only route into the pattern here.
    const pairOnly = {
      ...HEALTHY,
      [MetricKey.REVENUE_PENDING_TREATMENT_VALUE]: 180_000,
      [MetricKey.TREATMENT_ACCEPTED_PENDING_SCHEDULING]: 9,
    };
    const result = diagnoseMetrics(pairOnly);
    expect(patternsOf(result)).toContain(DiagnosisPattern.PIPELINE_CONVERSION_FAILURE);

    const diagnosis = pick(result, DiagnosisPattern.PIPELINE_CONVERSION_FAILURE);
    expect(statuses(diagnosis)).toMatchObject({
      no_available_capacity: "undetermined",
      booking_follow_through: "undetermined",
    });
    expect(discriminatorSlugs(diagnosis)).toContain("chair_utilization_level");
  });

  it("does not match a clinic with a small treatment book", () => {
    expect(patternsOf(diagnoseMetrics(HEALTHY))).not.toContain(
      DiagnosisPattern.PIPELINE_CONVERSION_FAILURE,
    );
  });
});
