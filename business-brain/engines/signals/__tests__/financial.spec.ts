import { describe, expect, it } from "vitest";

import { MetricKey } from "../../metrics/metric-ids";
import { collectionLaggingCompletionsEvaluator } from "../evaluators/financial/collection-lagging-completions";
import { highOutstandingEvaluator } from "../evaluators/financial/high-outstanding";
import { lowDailyRevenueEvaluator } from "../evaluators/financial/low-daily-revenue";
import { outstandingIncreasingEvaluator } from "../evaluators/financial/outstanding-increasing";
import { context, expectSignal } from "./fixtures/evaluator-harness";
import { HEALTHY_CLINIC, LOW_REVENUE_CLINIC } from "./fixtures/metric-fixtures";

describe("revenue.low_daily_revenue", () => {
  it("fires when a working day under-collects", () => {
    const signal = expectSignal(lowDailyRevenueEvaluator, context(LOW_REVENUE_CLINIC));
    expect(signal.id).toBe("signal.revenue.low_daily_revenue:clinic_123:2026-07-26");
    expect(signal.severity).toBe("high");
    expect(signal.priority).toBe("high");
    expect(signal.confidence).toBe(1);
    expect(signal.category).toBe("financial");
    expect(signal.relatedEntities).toEqual([{ type: "clinic", id: "clinic_123" }]);
    expect(signal.metricIds).toEqual([
      "revenue.collected_today:clinic_123:2026-07-26",
      "appointments.total_today:clinic_123:2026-07-26",
    ]);
  });

  it("stays silent on a healthy day", () => {
    expect(lowDailyRevenueEvaluator.evaluate(context(HEALTHY_CLINIC)).kind).toBe("no_signal");
  });

  it("is suppressed by the activity guard on a closed day", () => {
    const outcome = lowDailyRevenueEvaluator.evaluate(
      context({
        [MetricKey.REVENUE_COLLECTED_TODAY]: 0,
        [MetricKey.APPOINTMENTS_TOTAL_TODAY]: 1,
      }),
    );
    expect(outcome.kind).toBe("no_signal");
    if (outcome.kind === "no_signal") expect(outcome.reason).toContain("Clinic activity");
  });

  it("skips when a required metric is absent", () => {
    const outcome = lowDailyRevenueEvaluator.evaluate(
      context({ [MetricKey.REVENUE_COLLECTED_TODAY]: 100 }),
    );
    expect(outcome).toMatchObject({
      kind: "skipped",
      missing: [MetricKey.APPOINTMENTS_TOTAL_TODAY],
    });
  });
});

describe("revenue.high_outstanding", () => {
  it("fires above the balance limit and grades the breach", () => {
    const signal = expectSignal(highOutstandingEvaluator, context(LOW_REVENUE_CLINIC));
    expect(signal.severity).toBe("critical");
    expect(signal.priority).toBe("critical");
    expect(signal.confidence).toBe(1);
    expect(signal.evidence?.map((e) => e.id)).toEqual([
      "signal.revenue.high_outstanding:clinic_123:2026-07-26#observed",
      "signal.revenue.high_outstanding:clinic_123:2026-07-26#threshold",
      "signal.revenue.high_outstanding:clinic_123:2026-07-26#breach",
      "signal.revenue.high_outstanding:clinic_123:2026-07-26#confidence",
    ]);
    expect(signal.evidence?.every((e) => e.source === "SignalEngine")).toBe(true);
  });

  it("stays silent within the limit", () => {
    expect(highOutstandingEvaluator.evaluate(context(HEALTHY_CLINIC)).kind).toBe("no_signal");
  });

  it("judges the UNMANAGED portion when a payment-plan figure is supplied", () => {
    // LOW_REVENUE_CLINIC carries 62,000 outstanding against the 25,000 default
    // limit. With 40,000 of it under an agreed plan, only 22,000 is unmanaged —
    // below the limit, so the signal must not fire.
    const outcome = highOutstandingEvaluator.evaluate(
      context({
        ...LOW_REVENUE_CLINIC,
        [MetricKey.REVENUE_OUTSTANDING_ON_PAYMENT_PLAN]: 40_000,
      }),
    );
    expect(outcome.kind).toBe("no_signal");
  });

  it("still fires when the unmanaged remainder clears the limit", () => {
    const signal = expectSignal(
      highOutstandingEvaluator,
      context({
        ...LOW_REVENUE_CLINIC,
        [MetricKey.REVENUE_OUTSTANDING_ON_PAYMENT_PLAN]: 10_000,
      }),
    );
    // 62,000 total − 10,000 managed = 52,000 unmanaged, which is what gets graded.
    expect(signal.description).toContain("52,000");
    expect(signal.description).toContain("10,000");
  });

  it("behaves exactly as before when no payment-plan metric is supplied", () => {
    // Backwards compatibility, stated as a test: no confidence penalty, no
    // change in outcome, for every repository that doesn't support this yet.
    const withPlanMetric = highOutstandingEvaluator.evaluate(context(LOW_REVENUE_CLINIC));
    expect(withPlanMetric.kind).toBe("signal");
    if (withPlanMetric.kind === "signal") {
      expect(withPlanMetric.signal.confidence).toBe(1);
    }
  });
});

describe("revenue.outstanding_increasing", () => {
  it("fires when the receivable book grows past the rate", () => {
    const signal = expectSignal(
      outstandingIncreasingEvaluator,
      context(HEALTHY_CLINIC, { previous: { [MetricKey.REVENUE_OUTSTANDING]: 4_000 } }),
    );
    // 8000 vs 4000 = +100%, threshold 20% -> breach 4.0
    expect(signal.severity).toBe("critical");
    expect(signal.confidence).toBe(1);
    expect(signal.metricIds).toEqual([
      "revenue.outstanding:clinic_123:2026-07-26",
      "revenue.outstanding:clinic_123:2026-07-25",
    ]);
  });

  it("skips without a prior period rather than assuming zero", () => {
    const outcome = outstandingIncreasingEvaluator.evaluate(context(HEALTHY_CLINIC));
    expect(outcome.kind).toBe("skipped");
  });

  it("grades a zero baseline against the absolute floor instead of going silent", () => {
    const signal = expectSignal(
      outstandingIncreasingEvaluator,
      context(
        { [MetricKey.REVENUE_OUTSTANDING]: 40_000 },
        { previous: { [MetricKey.REVENUE_OUTSTANDING]: 0 } },
      ),
    );
    // 40,000 vs floor 5,000 -> breach 7.0
    const breach = (signal.evidence ?? []).find((e) => e.id.endsWith("#breach"));
    expect(breach?.data).toMatchObject({ breach: 7, scale: "relative" });
    expect(signal.severity).toBe("critical");
    expect(signal.description).toContain("prior baseline is zero");
  });

  it("respects the absolute floor on small balances", () => {
    const outcome = outstandingIncreasingEvaluator.evaluate(
      context(
        { [MetricKey.REVENUE_OUTSTANDING]: 1_200 },
        { previous: { [MetricKey.REVENUE_OUTSTANDING]: 800 } },
      ),
    );
    expect(outcome.kind).toBe("no_signal");
    if (outcome.kind === "no_signal") expect(outcome.reason).toContain("growth floor");
  });

  it("stays silent on modest growth", () => {
    const outcome = outstandingIncreasingEvaluator.evaluate(
      context(HEALTHY_CLINIC, { previous: { [MetricKey.REVENUE_OUTSTANDING]: 7_500 } }),
    );
    expect(outcome.kind).toBe("no_signal");
  });
});

describe("revenue.collection_lagging_completions", () => {
  it("fires when work was delivered but cash did not arrive", () => {
    const signal = expectSignal(
      collectionLaggingCompletionsEvaluator,
      context(LOW_REVENUE_CLINIC),
    );
    expect(signal.severity).toBe("high");
    expect(signal.confidence).toBe(1);
  });

  it("stays silent below the completions guard", () => {
    const outcome = collectionLaggingCompletionsEvaluator.evaluate(
      context({
        [MetricKey.TREATMENT_COMPLETED_TODAY]: 1,
        [MetricKey.REVENUE_COLLECTED_TODAY]: 0,
      }),
    );
    expect(outcome.kind).toBe("no_signal");
    if (outcome.kind === "no_signal") expect(outcome.reason).toContain("below the minimum 2");
  });

  it("takes a small-sample confidence penalty", () => {
    const signal = expectSignal(
      collectionLaggingCompletionsEvaluator,
      context({
        [MetricKey.TREATMENT_COMPLETED_TODAY]: 2,
        [MetricKey.REVENUE_COLLECTED_TODAY]: 500,
      }),
    );
    expect(signal.confidence).toBe(0.85);
  });
});
