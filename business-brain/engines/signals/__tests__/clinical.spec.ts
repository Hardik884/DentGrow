import { describe, expect, it } from "vitest";

import { MetricKey } from "../../metrics/metric-ids";
import { acceptedTreatmentsUnscheduledEvaluator } from "../evaluators/clinical/accepted-treatments-unscheduled";
import { largePendingTreatmentValueEvaluator } from "../evaluators/clinical/large-pending-treatment-value";
import { pipelineStalledEvaluator } from "../evaluators/clinical/pipeline-stalled";
import { context, expectSignal } from "./fixtures/evaluator-harness";
import {
  EMPTY_CLINIC,
  HEALTHY_CLINIC,
  LARGE_PIPELINE_BUSY_CLINIC,
  LARGE_PIPELINE_CLINIC,
} from "./fixtures/metric-fixtures";

describe("clinical.large_pending_treatment_value", () => {
  it("fires on a 180,000 pending book", () => {
    const signal = expectSignal(
      largePendingTreatmentValueEvaluator,
      context(LARGE_PIPELINE_CLINIC),
    );
    expect(signal.severity).toBe("critical");
    expect(signal.category).toBe("clinical");
    const observed = (signal.evidence ?? []).find((e) => e.id.endsWith("#observed"));
    expect(observed?.description).toBe("Pending treatment value = INR 180,000");
  });

  it("stays silent within the limit", () => {
    expect(largePendingTreatmentValueEvaluator.evaluate(context(HEALTHY_CLINIC)).kind).toBe(
      "no_signal",
    );
  });
});

describe("clinical.accepted_treatments_unscheduled", () => {
  it("fires on 9 accepted treatments without a date", () => {
    const signal = expectSignal(
      acceptedTreatmentsUnscheduledEvaluator,
      context(LARGE_PIPELINE_CLINIC),
    );
    expect(signal.severity).toBe("high");
  });

  it("stays silent within the limit", () => {
    expect(
      acceptedTreatmentsUnscheduledEvaluator.evaluate(context(HEALTHY_CLINIC)).kind,
    ).toBe("no_signal");
  });
});

describe("clinical.pipeline_stalled", () => {
  it("fires when banked demand, a thin schedule, and free capacity coincide", () => {
    const signal = expectSignal(pipelineStalledEvaluator, context(LARGE_PIPELINE_CLINIC));
    expect(signal.severity).toBe("critical");
    // 3 appointments is below the minimum sample of 5
    expect(signal.confidence).toBe(0.85);
    expect(signal.metricIds).toEqual([
      "revenue.pending_treatment_value:clinic_123:2026-07-26",
      "appointments.total_today:clinic_123:2026-07-26",
      "capacity.available_slots_today:clinic_123:2026-07-26",
    ]);
  });

  it("stays silent when the schedule is busy", () => {
    const outcome = pipelineStalledEvaluator.evaluate(context(LARGE_PIPELINE_BUSY_CLINIC));
    expect(outcome.kind).toBe("no_signal");
    if (outcome.kind === "no_signal") expect(outcome.reason).toContain("schedule is moving");
  });

  it("stays silent when there is no free capacity", () => {
    const outcome = pipelineStalledEvaluator.evaluate(
      context({
        [MetricKey.REVENUE_PENDING_TREATMENT_VALUE]: 180_000,
        [MetricKey.APPOINTMENTS_TOTAL_TODAY]: 2,
        [MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY]: 0,
      }),
    );
    expect(outcome.kind).toBe("no_signal");
    if (outcome.kind === "no_signal") expect(outcome.reason).toContain("No available slots");
  });

  it("stays silent on an empty clinic", () => {
    expect(pipelineStalledEvaluator.evaluate(context(EMPTY_CLINIC)).kind).toBe("no_signal");
  });
});
