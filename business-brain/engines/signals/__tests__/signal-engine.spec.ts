import { describe, expect, it } from "vitest";

import { SignalType } from "../../../domain";
import type { ExecutionContext } from "../../../types";
import { MetricKey } from "../../metrics/metric-ids";
import { DentGrowSignalEngine } from "../signal-engine";
import {
  CLINIC_ID,
  DATE,
  HEALTHY_CLINIC,
  LARGE_PIPELINE_CLINIC,
  NOW,
  metrics,
  previousMetrics,
} from "./fixtures/metric-fixtures";

const context: ExecutionContext = {
  clinicId: CLINIC_ID,
  correlationId: "corr-1",
  startedAt: NOW,
  requestedBy: "user_1",
  role: "dentist",
};

const engine = new DentGrowSignalEngine();

describe("DentGrowSignalEngine", () => {
  it("wraps signals in an EngineResult using context.startedAt as the clock", () => {
    const result = engine.run(
      { metrics: metrics(LARGE_PIPELINE_CLINIC), date: DATE },
      context,
    );
    expect(result.ok).toBe(true);
    expect(result.generatedAt).toBe(NOW);
    expect(result.data?.every((signal) => signal.generatedAt === NOW)).toBe(true);
    // mean of 1, 1, 1, 0.85, 1
    expect(result.confidence).toBe(0.97);
  });

  it("reports input coverage, not 1.0, when nothing was emitted", () => {
    // Complete current-period metrics, no prior period: the 15 same-day
    // evaluators reach a verdict, the 3 trend evaluators cannot.
    const result = engine.run({ metrics: metrics(HEALTHY_CLINIC), date: DATE }, context);
    expect(result.data).toEqual([]);
    expect(result.confidence).toBe(0.83);

    // Nothing to evaluate at all must not report full confidence.
    const blind = engine.run({ metrics: [], date: DATE }, context);
    expect(blind.data).toEqual([]);
    expect(blind.confidence).toBe(0);

    // A quiet day over complete data legitimately reports 1.
    const complete = engine.run(
      {
        metrics: metrics(HEALTHY_CLINIC),
        previousMetrics: previousMetrics({
          [MetricKey.REVENUE_OUTSTANDING]: 8_000,
          [MetricKey.PATIENTS_RETURNING_TODAY]: 9,
          [MetricKey.QUEUE_PATIENTS_WAITING]: 2,
        }),
        date: DATE,
      },
      context,
    );
    expect(complete.data).toEqual([]);
    expect(complete.confidence).toBe(1);
  });

  it("traces every evaluator, including skips", () => {
    const result = engine.run({ metrics: metrics(HEALTHY_CLINIC), date: DATE }, context);
    const steps = (result.trace ?? []).map((t) => t.step);
    expect(steps[0]).toBe("index-metrics");
    expect(steps[steps.length - 1]).toBe("summarise-run");
    expect(steps).toHaveLength(20);
    expect(new Set(steps).size).toBe(20);
    expect((result.trace ?? []).every((t) => t.engine === "SignalEngine")).toBe(true);
    expect(
      (result.trace ?? []).find((t) => t.step === SignalType.REVENUE_OUTSTANDING_INCREASING)
        ?.reasoning,
    ).toContain("Skipped:");
  });

  it("derives the clinic from the execution context", () => {
    const result = engine.run(
      { metrics: metrics({ [MetricKey.FOLLOWUPS_OVERDUE]: 30 }), date: DATE },
      { ...context, clinicId: CLINIC_ID },
    );
    expect(result.data?.[0].id).toBe(
      "signal.retention.followup_backlog:clinic_123:2026-07-26",
    );
    expect(result.data?.[0].relatedEntities).toEqual([{ type: "clinic", id: CLINIC_ID }]);
  });

  it("returns a typed error for mixed-clinic input", () => {
    const result = engine.run(
      {
        metrics: [
          ...metrics({ [MetricKey.FOLLOWUPS_OVERDUE]: 30 }),
          ...metrics({ [MetricKey.QUEUE_PATIENTS_WAITING]: 8 }, { clinicId: "clinic_999" }),
        ],
        date: DATE,
      },
      context,
      );
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("SIGNAL_ENGINE_MIXED_CLINIC");
    expect(result.trace?.[0].step).toBe("validate-input");
  });

  it("passes the caller's prior period through and never fetches one", () => {
    const result = engine.run(
      {
        metrics: metrics(HEALTHY_CLINIC),
        previousMetrics: previousMetrics({ [MetricKey.REVENUE_OUTSTANDING]: 2_000 }),
        date: DATE,
      },
      context,
    );
    expect(result.data?.map((s) => s.id)).toContain(
      "signal.revenue.outstanding_increasing:clinic_123:2026-07-26",
    );
  });

  it("honours construction-time threshold overrides", () => {
    const strict = new DentGrowSignalEngine({
      config: { followups: { overdueFollowupLimit: 1 } },
    });
    const result = strict.run({ metrics: metrics(HEALTHY_CLINIC), date: DATE }, context);
    expect(result.data?.map((s) => s.id)).toEqual([
      "signal.retention.followup_backlog:clinic_123:2026-07-26",
    ]);
  });

  it("matches run() through the async contract entry point", async () => {
    const input = { metrics: metrics(LARGE_PIPELINE_CLINIC), date: DATE };
    await expect(engine.execute(input, context)).resolves.toEqual(engine.run(input, context));
  });
});
