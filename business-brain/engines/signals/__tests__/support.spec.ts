import { describe, expect, it } from "vitest";

import { MetricUnit, SignalType } from "../../../domain";
import { DEFAULT_SIGNAL_THRESHOLDS, resolveConfig } from "../config/signal-thresholds";
import { computeConfidence } from "../support/confidence";
import { formatValue } from "../support/evidence";
import { growth, percentageOf, round2 } from "../support/numbers";
import { assessBreach, priorityFor, severityFromBreach } from "../support/severity";
import { ThresholdDirection } from "../support/severity";

const config = DEFAULT_SIGNAL_THRESHOLDS;

describe("numbers", () => {
  it("rounds to a fixed precision so float drift cannot flip a threshold", () => {
    expect(round2(25.806451612903224)).toBe(25.81);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(-0)).toBe(0);
  });

  it("returns null instead of NaN or Infinity for a zero denominator", () => {
    expect(percentageOf(3, 0)).toBeNull();
    expect(percentageOf(0, 0)).toBeNull();
    expect(percentageOf(8, 31)).toBe(25.81);
  });

  it("flags a zero baseline instead of dividing by it", () => {
    expect(growth(5, 0)).toEqual({ kind: "no_baseline", delta: 5 });
    expect(growth(12, 4)).toEqual({ kind: "percent", percent: 200, delta: 8 });
  });
});

describe("severity", () => {
  it("maps breach magnitude onto the configured bands", () => {
    const bands = config.severity.bands;
    expect(severityFromBreach(0.09, bands)).toBe("info");
    expect(severityFromBreach(0.1, bands)).toBe("low");
    expect(severityFromBreach(0.25, bands)).toBe("medium");
    expect(severityFromBreach(0.5, bands)).toBe("high");
    expect(severityFromBreach(1, bands)).toBe("critical");
  });

  it("computes an upper-bound breach relative to the threshold", () => {
    expect(
      assessBreach({
        value: 25.81,
        threshold: 10,
        direction: ThresholdDirection.UPPER,
        type: SignalType.SCHEDULING_HIGH_CANCELLATION_RATE,
        config,
      }),
    ).toMatchObject({ breach: 1.58, severity: "critical", priority: "critical", scale: "relative" });
  });

  it("computes a lower-bound breach relative to the threshold", () => {
    expect(
      assessBreach({
        value: 1_200,
        threshold: 5_000,
        direction: ThresholdDirection.LOWER,
        type: SignalType.REVENUE_LOW_DAILY_REVENUE,
        config,
      }),
    ).toMatchObject({ breach: 0.76, severity: "high" });
  });

  it("falls back to an absolute delta when the threshold is zero", () => {
    expect(
      assessBreach({
        value: 4,
        threshold: 0,
        direction: ThresholdDirection.UPPER,
        type: SignalType.OPERATIONAL_QUEUE_BACKLOG,
        config,
      }),
    ).toMatchObject({ breach: 4, scale: "absolute", severity: "critical" });
  });

  it("clamps with per-signal floors and ceilings", () => {
    expect(
      assessBreach({
        value: 0,
        threshold: 1,
        direction: ThresholdDirection.LOWER,
        type: SignalType.OPERATIONAL_NEAR_FULL_CAPACITY,
        config,
      }),
    ).toMatchObject({ bandSeverity: "critical", severity: "medium", priority: "medium" });
  });

  it("derives priority from severity by a fixed table", () => {
    expect(priorityFor("critical")).toBe("critical");
    expect(priorityFor("high")).toBe("high");
    expect(priorityFor("medium")).toBe("medium");
    expect(priorityFor("low")).toBe("low");
    expect(priorityFor("info")).toBe("low");
  });
});

describe("confidence", () => {
  it("starts at 1 with complete, current data", () => {
    expect(computeConfidence({ config }).confidence).toBe(1);
  });

  it("deducts for absent optional metrics, small samples, and stale periods", () => {
    expect(
      computeConfidence({ config, missingOptionalMetrics: 2 }).confidence,
    ).toBe(0.8);
    expect(computeConfidence({ config, denominator: 3 }).confidence).toBe(0.85);
    expect(computeConfidence({ config, staleMetrics: 1 }).confidence).toBe(0.8);
    expect(
      computeConfidence({
        config,
        missingOptionalMetrics: 1,
        denominator: 2,
        staleMetrics: 1,
      }).confidence,
    ).toBe(0.55);
  });

  it("never falls below the configured floor", () => {
    expect(
      computeConfidence({
        config: resolveConfig({ confidence: { missingOptionalMetricPenalty: 0.5 } }),
        missingOptionalMetrics: 4,
      }).confidence,
    ).toBe(0.3);
  });
});

describe("config", () => {
  it("deep-merges overrides without mutating the defaults", () => {
    const merged = resolveConfig({ revenue: { minimumDailyRevenue: 100 } });
    expect(merged.revenue.minimumDailyRevenue).toBe(100);
    expect(merged.revenue.outstandingBalanceLimit).toBe(
      DEFAULT_SIGNAL_THRESHOLDS.revenue.outstandingBalanceLimit,
    );
    expect(DEFAULT_SIGNAL_THRESHOLDS.revenue.minimumDailyRevenue).toBe(5_000);
  });
});

describe("evidence formatting", () => {
  it("formats units deterministically without locale dependence", () => {
    expect(formatValue(180_000, MetricUnit.CURRENCY)).toBe("INR 180,000");
    expect(formatValue(1_234.5, MetricUnit.CURRENCY)).toBe("INR 1,234.50");
    expect(formatValue(25.806, MetricUnit.PERCENTAGE)).toBe("25.81%");
    expect(formatValue(55, MetricUnit.MINUTES)).toBe("55 min");
    expect(formatValue(31, MetricUnit.COUNT)).toBe("31");
    expect(formatValue(-4, MetricUnit.COUNT)).toBe("-4");
  });
});
