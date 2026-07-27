import { describe, expect, it } from "vitest";

import { MetricKey } from "../../metrics/metric-ids";
import { longWaitingTimeEvaluator } from "../evaluators/operational/long-waiting-time";
import { lowChairUtilizationEvaluator } from "../evaluators/operational/low-chair-utilization";
import { nearFullCapacityEvaluator } from "../evaluators/operational/near-full-capacity";
import { queueBacklogEvaluator } from "../evaluators/operational/queue-backlog";
import { queueBuildingUpEvaluator } from "../evaluators/operational/queue-building-up";
import { context, expectSignal } from "./fixtures/evaluator-harness";
import {
  BUSY_CLINIC,
  EMPTY_CLINIC,
  HEALTHY_CLINIC,
  LARGE_PIPELINE_CLINIC,
  PARTIAL_METRICS_CLINIC,
} from "./fixtures/metric-fixtures";

describe("operational.long_waiting_time", () => {
  it("fires at 55 minutes average wait", () => {
    const signal = expectSignal(longWaitingTimeEvaluator, context(PARTIAL_METRICS_CLINIC));
    // 55 vs 30 -> breach 0.83
    expect(signal.severity).toBe("high");
    expect(signal.confidence).toBe(1);
  });

  it("loses confidence without the optional queue length", () => {
    const signal = expectSignal(
      longWaitingTimeEvaluator,
      context({ [MetricKey.QUEUE_AVERAGE_WAITING_TIME]: 55 }),
    );
    expect(signal.confidence).toBe(0.9);
  });

  it("stays silent on a healthy day", () => {
    expect(longWaitingTimeEvaluator.evaluate(context(HEALTHY_CLINIC)).kind).toBe("no_signal");
  });
});

describe("operational.queue_backlog", () => {
  it("fires at 9 patients waiting", () => {
    const signal = expectSignal(queueBacklogEvaluator, context(PARTIAL_METRICS_CLINIC));
    expect(signal.severity).toBe("high");
  });

  it("stays silent at 2 patients waiting", () => {
    expect(queueBacklogEvaluator.evaluate(context(HEALTHY_CLINIC)).kind).toBe("no_signal");
  });
});

describe("operational.queue_building_up", () => {
  it("fires on 200% growth above the floor", () => {
    const signal = expectSignal(
      queueBuildingUpEvaluator,
      context(
        { [MetricKey.QUEUE_PATIENTS_WAITING]: 6 },
        { previous: { [MetricKey.QUEUE_PATIENTS_WAITING]: 2 } },
      ),
    );
    expect(signal.severity).toBe("critical");
    expect(signal.confidence).toBe(1);
  });

  it("respects the absolute floor on small queues", () => {
    const outcome = queueBuildingUpEvaluator.evaluate(
      context(
        { [MetricKey.QUEUE_PATIENTS_WAITING]: 2 },
        { previous: { [MetricKey.QUEUE_PATIENTS_WAITING]: 1 } },
      ),
    );
    expect(outcome.kind).toBe("no_signal");
    if (outcome.kind === "no_signal") expect(outcome.reason).toContain("growth floor");
  });

  it("falls back to the floor instead of dividing by a zero baseline", () => {
    const signal = expectSignal(
      queueBuildingUpEvaluator,
      context(
        { [MetricKey.QUEUE_PATIENTS_WAITING]: 7 },
        { previous: { [MetricKey.QUEUE_PATIENTS_WAITING]: 0 } },
      ),
    );
    // 7 vs floor 3 -> breach 1.33
    const breach = (signal.evidence ?? []).find((e) => e.id.endsWith("#breach"));
    expect(breach?.data).toMatchObject({ breach: 1.33, scale: "relative" });
    expect(signal.severity).toBe("critical");
  });

  it("skips without a prior period", () => {
    expect(queueBuildingUpEvaluator.evaluate(context(HEALTHY_CLINIC)).kind).toBe("skipped");
  });
});

describe("operational.low_chair_utilization", () => {
  it("fires when there is genuinely idle capacity", () => {
    const signal = expectSignal(lowChairUtilizationEvaluator, context(LARGE_PIPELINE_CLINIC));
    // 22% vs 50% -> breach 0.56
    expect(signal.severity).toBe("high");
    expect(signal.confidence).toBe(1);
  });

  it("stays silent on an empty clinic with no open slots", () => {
    const outcome = lowChairUtilizationEvaluator.evaluate(context(EMPTY_CLINIC));
    expect(outcome.kind).toBe("no_signal");
    if (outcome.kind === "no_signal") expect(outcome.reason).toContain("No available slots");
  });

  it("stays silent on a busy clinic", () => {
    expect(lowChairUtilizationEvaluator.evaluate(context(BUSY_CLINIC)).kind).toBe("no_signal");
  });
});

describe("operational.near_full_capacity", () => {
  it("fires on a busy clinic and is capped at medium", () => {
    const signal = expectSignal(nearFullCapacityEvaluator, context(BUSY_CLINIC));
    expect(signal.severity).toBe("medium");
    expect(signal.priority).toBe("medium");
    const breach = (signal.evidence ?? []).find((e) => e.id.endsWith("#breach"));
    expect(breach?.data).toMatchObject({ bandSeverity: "critical", severity: "medium" });
  });

  it("fires on the utilization branch alone", () => {
    const signal = expectSignal(
      nearFullCapacityEvaluator,
      context({
        [MetricKey.CAPACITY_CHAIR_UTILIZATION]: 94,
        [MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY]: 4,
        [MetricKey.APPOINTMENTS_TOTAL_TODAY]: 18,
      }),
    );
    expect(signal.severity).toBe("info");
    expect(signal.priority).toBe("low");
  });

  it("stays silent on an empty clinic that never opened", () => {
    const outcome = nearFullCapacityEvaluator.evaluate(context(EMPTY_CLINIC));
    expect(outcome.kind).toBe("no_signal");
    if (outcome.kind === "no_signal") expect(outcome.reason).toContain("No appointments today");
  });

  it("still fires without the optional closed-day guard when utilization is breached", () => {
    const signal = expectSignal(
      nearFullCapacityEvaluator,
      context({
        [MetricKey.CAPACITY_CHAIR_UTILIZATION]: 96,
        [MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY]: 0,
      }),
    );
    expect(signal.confidence).toBe(0.9);
  });

  it("skips a slots-only breach when the closed-day guard is missing", () => {
    // Zero utilization and zero open slots is exactly what a closed clinic
    // reports. Without the appointment count it is indistinguishable from a
    // fully booked day, so the evaluator must not claim either.
    const outcome = nearFullCapacityEvaluator.evaluate(
      context({
        [MetricKey.CAPACITY_CHAIR_UTILIZATION]: 0,
        [MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY]: 0,
      }),
    );
    expect(outcome).toMatchObject({
      kind: "skipped",
      missing: [MetricKey.APPOINTMENTS_TOTAL_TODAY],
    });
  });

  it("stays silent on a healthy day", () => {
    expect(nearFullCapacityEvaluator.evaluate(context(HEALTHY_CLINIC)).kind).toBe("no_signal");
  });
});
