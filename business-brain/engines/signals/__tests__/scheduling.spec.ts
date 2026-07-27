import { describe, expect, it } from "vitest";

import { MetricKey } from "../../metrics/metric-ids";
import { highCancellationRateEvaluator } from "../evaluators/scheduling/high-cancellation-rate";
import { highNoShowRateEvaluator } from "../evaluators/scheduling/high-no-show-rate";
import { lowAppointmentVolumeEvaluator } from "../evaluators/scheduling/low-appointment-volume";
import { context, expectSignal } from "./fixtures/evaluator-harness";
import {
  EMPTY_CLINIC,
  HEALTHY_CLINIC,
  HIGH_CANCELLATION_CLINIC,
} from "./fixtures/metric-fixtures";

describe("scheduling.high_cancellation_rate", () => {
  it("fires on 8 of 31 cancelled and reports the derived ratio in evidence", () => {
    const signal = expectSignal(
      highCancellationRateEvaluator,
      context(HIGH_CANCELLATION_CLINIC),
    );
    expect(signal.severity).toBe("critical");
    expect(signal.priority).toBe("critical");
    expect(signal.confidence).toBe(1);

    const bySlug = new Map(
      (signal.evidence ?? []).map((e) => [e.id.split("#")[1], e.description]),
    );
    expect(bySlug.get("observed")).toBe("Cancellation rate = 25.81%");
    expect(bySlug.get("threshold")).toBe(
      "Configured cancellation rate threshold = 10.00% (upper bound)",
    );
    expect(bySlug.get("inputs")).toBe(
      "Cancelled appointments = 8; Total appointments = 31",
    );
    expect(bySlug.get("breach")).toBe("Breach magnitude = 1.58 (relative) -> critical");
  });

  it("stays silent on a healthy day", () => {
    expect(highCancellationRateEvaluator.evaluate(context(HEALTHY_CLINIC)).kind).toBe(
      "no_signal",
    );
  });

  it("does not divide by zero when there are no appointments", () => {
    const outcome = highCancellationRateEvaluator.evaluate(context(EMPTY_CLINIC));
    expect(outcome.kind).toBe("no_signal");
    if (outcome.kind === "no_signal") expect(outcome.reason).toContain("undefined");
  });

  it("suppresses the rate below the minimum sample", () => {
    const outcome = highCancellationRateEvaluator.evaluate(
      context({
        [MetricKey.APPOINTMENTS_TOTAL_TODAY]: 3,
        [MetricKey.APPOINTMENTS_CANCELLED_TODAY]: 2,
      }),
    );
    expect(outcome.kind).toBe("no_signal");
    if (outcome.kind === "no_signal") expect(outcome.reason).toContain("sample 3");
  });
});

describe("scheduling.high_no_show_rate", () => {
  it("fires on 4 of 31 no-shows", () => {
    const signal = expectSignal(highNoShowRateEvaluator, context(HIGH_CANCELLATION_CLINIC));
    // 12.90% vs 8% -> breach 0.61
    expect(signal.severity).toBe("high");
    expect(signal.confidence).toBe(1);
  });

  it("stays silent with no no-shows", () => {
    expect(highNoShowRateEvaluator.evaluate(context(HEALTHY_CLINIC)).kind).toBe("no_signal");
  });
});

describe("scheduling.low_appointment_volume", () => {
  it("fires on a thin day", () => {
    const signal = expectSignal(
      lowAppointmentVolumeEvaluator,
      context({ [MetricKey.APPOINTMENTS_TOTAL_TODAY]: 3 }),
    );
    expect(signal.severity).toBe("medium");
    expect(signal.confidence).toBe(1);
  });

  it("is capped at high on an empty day instead of reporting critical", () => {
    const signal = expectSignal(lowAppointmentVolumeEvaluator, context(EMPTY_CLINIC));
    expect(signal.severity).toBe("high");
    expect(signal.priority).toBe("high");
    const breach = (signal.evidence ?? []).find((e) => e.id.endsWith("#breach"));
    expect(breach?.data).toMatchObject({ breach: 1, bandSeverity: "critical", severity: "high" });
  });

  it("stays silent at or above the minimum", () => {
    expect(lowAppointmentVolumeEvaluator.evaluate(context(HEALTHY_CLINIC)).kind).toBe(
      "no_signal",
    );
  });
});
