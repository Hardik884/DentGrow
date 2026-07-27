import { describe, expect, it } from "vitest";

import { DiagnosisPattern } from "../../../domain";
import { MetricKey } from "../../metrics/metric-ids";
import {
  diagnoseMetrics,
  discriminatorSlugs,
  evidenceFor,
  hypothesis,
  patternsOf,
  pick,
  statuses,
} from "./fixtures/diagnose-harness";
import {
  CONGESTION_CAPACITY_BOUND,
  CONGESTION_FLOW_BOUND,
  DEMAND_SUPPLY_NO_PENDING,
  DEMAND_SUPPLY_WITH_PENDING,
  HEALTHY,
} from "./fixtures/run-fixtures";

describe("demand_supply_mismatch", () => {
  it("supports the conversion hypothesis and contradicts absent demand when demand exists", () => {
    const diagnosis = pick(
      diagnoseMetrics(DEMAND_SUPPLY_WITH_PENDING),
      DiagnosisPattern.DEMAND_SUPPLY_MISMATCH,
    );
    expect(statuses(diagnosis)).toEqual({
      unconverted_demand: "supported",
      insufficient_demand: "contradicted",
      capacity_not_offered: "undetermined",
    });
    expect(hypothesis(diagnosis, "unconverted_demand").requiredData).toEqual([]);
    expect(
      hypothesis(diagnosis, "capacity_not_offered").requiredData.length,
    ).toBeGreaterThan(0);
    expect(evidenceFor(diagnosis, "discrimination.demand")).toContain(
      "INR 180,000",
    );
  });

  it("reverses the verdict when the treatment book is empty and new patients are low", () => {
    const diagnosis = pick(
      diagnoseMetrics(DEMAND_SUPPLY_NO_PENDING),
      DiagnosisPattern.DEMAND_SUPPLY_MISMATCH,
    );
    expect(statuses(diagnosis)).toEqual({
      insufficient_demand: "supported",
      unconverted_demand: "contradicted",
      capacity_not_offered: "undetermined",
    });
  });

  it("leaves both undetermined when the demand metrics were not supplied", () => {
    const withoutDemandMetrics = { ...DEMAND_SUPPLY_WITH_PENDING };
    delete withoutDemandMetrics[MetricKey.REVENUE_PENDING_TREATMENT_VALUE];
    delete withoutDemandMetrics[MetricKey.TREATMENT_ACCEPTED_PENDING_SCHEDULING];

    const diagnosis = pick(
      diagnoseMetrics(withoutDemandMetrics),
      DiagnosisPattern.DEMAND_SUPPLY_MISMATCH,
    );
    expect(statuses(diagnosis)).toEqual({
      insufficient_demand: "undetermined",
      unconverted_demand: "undetermined",
      capacity_not_offered: "undetermined",
    });
    // an entirely undetermined diagnosis must carry discriminators
    expect(discriminatorSlugs(diagnosis).length).toBeGreaterThan(0);
    expect(
      diagnosis.hypotheses.every((h) => h.confidence <= 0.5),
    ).toBe(true);
  });

  it("does not match when only one of the two required signals fired", () => {
    const result = diagnoseMetrics({
      ...HEALTHY,
      [MetricKey.CAPACITY_CHAIR_UTILIZATION]: 22,
      [MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY]: 11,
    });
    expect(patternsOf(result)).not.toContain(DiagnosisPattern.DEMAND_SUPPLY_MISMATCH);
  });
});

describe("throughput_congestion", () => {
  it("is capacity-bound when the chair is full while patients wait", () => {
    const result = diagnoseMetrics(CONGESTION_CAPACITY_BOUND);
    const diagnosis = pick(result, DiagnosisPattern.THROUGHPUT_CONGESTION);
    expect(statuses(diagnosis)).toEqual({
      capacity_bound: "supported",
      flow_bound: "contradicted",
      service_time_variance: "undetermined",
      arrival_punctuality: "undetermined",
    });
    expect(evidenceFor(diagnosis, "discrimination.capacity")).toContain("96.00%");
  });

  it("is flow-bound when capacity was available while patients waited", () => {
    const diagnosis = pick(
      diagnoseMetrics(CONGESTION_FLOW_BOUND),
      DiagnosisPattern.THROUGHPUT_CONGESTION,
    );
    expect(statuses(diagnosis)).toEqual({
      flow_bound: "supported",
      capacity_bound: "contradicted",
      service_time_variance: "undetermined",
      arrival_punctuality: "undetermined",
    });
  });

  it("leaves the split undetermined without the utilization metric", () => {
    const noUtilization = { ...CONGESTION_FLOW_BOUND };
    delete noUtilization[MetricKey.CAPACITY_CHAIR_UTILIZATION];
    delete noUtilization[MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY];

    const diagnosis = pick(
      diagnoseMetrics(noUtilization),
      DiagnosisPattern.THROUGHPUT_CONGESTION,
    );
    expect(statuses(diagnosis)).toMatchObject({
      capacity_bound: "undetermined",
      flow_bound: "undetermined",
    });
    expect(discriminatorSlugs(diagnosis)).toContain("chair_utilization_level");
  });
});

describe("capacity_ceiling", () => {
  it("supports demand meeting capacity but never claims suppressed acquisition", () => {
    const result = diagnoseMetrics(CONGESTION_CAPACITY_BOUND);
    const diagnosis = pick(result, DiagnosisPattern.CAPACITY_CEILING);
    expect(statuses(diagnosis)).toEqual({
      demand_exceeds_capacity: "supported",
      capacity_suppresses_acquisition: "undetermined",
      schedule_overbooking: "undetermined",
    });
    const suppressed = hypothesis(diagnosis, "capacity_suppresses_acquisition");
    expect(suppressed.confidence).toBeLessThanOrEqual(0.5);
    expect(suppressed.requiredData.length).toBeGreaterThan(0);
  });

  it("keeps the acquisition hypothesis undetermined even when the signal co-occurs", () => {
    const busyAndNoNewPatients = {
      ...CONGESTION_CAPACITY_BOUND,
      [MetricKey.PATIENTS_NEW_TODAY]: 0,
    };
    const diagnosis = pick(
      diagnoseMetrics(busyAndNoNewPatients),
      DiagnosisPattern.CAPACITY_CEILING,
    );
    const suppressed = hypothesis(diagnosis, "capacity_suppresses_acquisition");
    expect(suppressed.status).toBe("undetermined");
    expect(suppressed.supporting[0].description).toContain("co-occurrence");
  });

  it("does not match a full chair with no queue", () => {
    const result = diagnoseMetrics({
      ...HEALTHY,
      [MetricKey.CAPACITY_CHAIR_UTILIZATION]: 96,
      [MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY]: 0,
    });
    expect(patternsOf(result)).not.toContain(DiagnosisPattern.CAPACITY_CEILING);
  });
});
