/**
 * Specs for per-clinic threshold calibration.
 *
 * The behaviour that matters most is the refusal to derive: a threshold sized
 * from a missing or zero denominator is worse than the global default, because
 * it looks tailored while being meaningless. A brand-new clinic with no
 * production history must keep the defaults, not inherit a threshold of zero.
 */

import { describe, expect, it } from "vitest";

import type { Metric } from "../../../domain";
import { MetricKey, buildMetric } from "../../metrics/metric-ids";
import { DEFAULT_SIGNAL_THRESHOLDS, mergeOverrides } from "../config/signal-thresholds";
import { CALIBRATION_RATIOS, calibrateThresholds } from "../config/calibration";

const CLINIC = "clinic_cal";
const DATE = "2026-07-28";

function m(key: MetricKey, value: number): Metric {
  return buildMetric(key, value, CLINIC, DATE, `${DATE}T06:30:00.000Z`);
}

function pathValue(overrides: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (acc, key) => (acc as Record<string, unknown> | undefined)?.[key],
    overrides,
  );
}

describe("capacity-denominated thresholds", () => {
  it("sizes the volume threshold from the slots this clinic offered", () => {
    const { overrides, applied } = calibrateThresholds([m(MetricKey.CAPACITY_TOTAL_SLOTS_TODAY, 16)]);
    // 30% of 16 slots.
    expect(pathValue(overrides, "appointments.minimumDailyAppointments")).toBe(5);
    expect(applied[0].basis).toContain("16 appointment slots");
  });

  it("gives a small clinic a smaller threshold than a large one", () => {
    // The whole point: one constant cannot serve both.
    const small = calibrateThresholds([m(MetricKey.CAPACITY_TOTAL_SLOTS_TODAY, 6)]);
    const large = calibrateThresholds([m(MetricKey.CAPACITY_TOTAL_SLOTS_TODAY, 40)]);
    const s = pathValue(small.overrides, "appointments.minimumDailyAppointments") as number;
    const l = pathValue(large.overrides, "appointments.minimumDailyAppointments") as number;
    expect(s).toBeLessThan(l);
    expect(s).toBe(2);
    expect(l).toBe(12);
  });

  it("never derives a threshold of zero, however few slots are offered", () => {
    // 30% of 1 slot rounds to 0, and a threshold of 0 either never fires or
    // always does depending on direction. One is the smallest meaningful value.
    const { overrides } = calibrateThresholds([m(MetricKey.CAPACITY_TOTAL_SLOTS_TODAY, 1)]);
    expect(pathValue(overrides, "appointments.minimumDailyAppointments")).toBe(1);
  });

  it("derives nothing on a closed day rather than sizing from zero", () => {
    const { overrides, applied } = calibrateThresholds([m(MetricKey.CAPACITY_TOTAL_SLOTS_TODAY, 0)]);
    expect(overrides).toEqual({});
    expect(applied).toEqual([]);
  });
});

describe("money thresholds sized against the clinic's own figures", () => {
  const metrics = [
    m(MetricKey.REVENUE_COLLECTED_30D, 150_000),
    m(MetricKey.REVENUE_PRODUCTION_30D, 180_000),
  ];

  it("sizes the daily revenue floor from typical daily takings", () => {
    const { overrides } = calibrateThresholds(metrics);
    // 150000 / 30 = 5000 a day; 40% of that.
    expect(pathValue(overrides, "revenue.minimumDailyRevenue")).toBe(2000);
  });

  it("sizes the outstanding limit as a multiple of monthly production", () => {
    const { overrides } = calibrateThresholds(metrics);
    expect(pathValue(overrides, "revenue.outstandingBalanceLimit")).toBe(180_000);
  });

  it("sizes the pending-work limit as a multiple of monthly production", () => {
    const { overrides } = calibrateThresholds(metrics);
    expect(pathValue(overrides, "treatment.pendingTreatmentValueLimit")).toBe(270_000);
  });

  it("keeps the daily floor well below a typical day so it is not a coin flip", () => {
    // At a share of 1.0 this threshold would fire on roughly half of all days.
    expect(CALIBRATION_RATIOS.MINIMUM_DAILY_REVENUE_SHARE).toBeLessThan(0.75);
  });
});

describe("refuses to derive from nothing", () => {
  it("returns no overrides for a clinic with no metrics at all", () => {
    const { overrides, applied } = calibrateThresholds([]);
    expect(overrides).toEqual({});
    expect(applied).toEqual([]);
  });

  it("leaves money thresholds alone for a brand-new clinic with no history", () => {
    // Production of zero must not become a threshold of zero, which would make
    // every outstanding balance look excessive on the clinic's first day.
    const { overrides } = calibrateThresholds([
      m(MetricKey.CAPACITY_TOTAL_SLOTS_TODAY, 16),
      m(MetricKey.REVENUE_PRODUCTION_30D, 0),
      m(MetricKey.REVENUE_COLLECTED_30D, 0),
    ]);
    expect(pathValue(overrides, "appointments.minimumDailyAppointments")).toBe(5);
    expect(pathValue(overrides, "revenue.outstandingBalanceLimit")).toBeUndefined();
    expect(pathValue(overrides, "revenue.minimumDailyRevenue")).toBeUndefined();
  });

  it("derives each threshold independently of the others", () => {
    // Money present, capacity absent: the money thresholds still calibrate.
    const { overrides } = calibrateThresholds([m(MetricKey.REVENUE_PRODUCTION_30D, 90_000)]);
    expect(pathValue(overrides, "appointments.minimumDailyAppointments")).toBeUndefined();
    expect(pathValue(overrides, "revenue.outstandingBalanceLimit")).toBe(90_000);
  });
});

describe("what is deliberately NOT calibrated", () => {
  const { overrides } = calibrateThresholds([
    m(MetricKey.CAPACITY_TOTAL_SLOTS_TODAY, 16),
    m(MetricKey.REVENUE_PRODUCTION_30D, 180_000),
    m(MetricKey.REVENUE_COLLECTED_30D, 150_000),
  ]);
  const merged = mergeOverrides(DEFAULT_SIGNAL_THRESHOLDS, overrides);

  it("leaves industry-benchmark RATES global so clinics stay comparable", () => {
    expect(merged.appointments.highNoShowRate).toBe(
      DEFAULT_SIGNAL_THRESHOLDS.appointments.highNoShowRate,
    );
    expect(merged.appointments.highCancellationRate).toBe(
      DEFAULT_SIGNAL_THRESHOLDS.appointments.highCancellationRate,
    );
    expect(merged.capacity.minimumChairUtilization).toBe(
      DEFAULT_SIGNAL_THRESHOLDS.capacity.minimumChairUtilization,
    );
  });

  it("leaves statistical guards and severity bands global", () => {
    expect(merged.appointments.minimumAppointmentSample).toBe(
      DEFAULT_SIGNAL_THRESHOLDS.appointments.minimumAppointmentSample,
    );
    expect(merged.severity.bands).toEqual(DEFAULT_SIGNAL_THRESHOLDS.severity.bands);
    expect(merged.confidence).toEqual(DEFAULT_SIGNAL_THRESHOLDS.confidence);
  });

  it("leaves thresholds whose honest denominator does not exist yet", () => {
    // maximumQueueLength wants a chair count and overdueFollowupLimit wants an
    // active roster size. Neither exists, and deriving them from something else
    // would invent a relationship rather than measure one.
    expect(merged.queue.maximumQueueLength).toBe(
      DEFAULT_SIGNAL_THRESHOLDS.queue.maximumQueueLength,
    );
    expect(merged.followups.overdueFollowupLimit).toBe(
      DEFAULT_SIGNAL_THRESHOLDS.followups.overdueFollowupLimit,
    );
  });
});

describe("determinism and transparency", () => {
  const metrics = [
    m(MetricKey.CAPACITY_TOTAL_SLOTS_TODAY, 16),
    m(MetricKey.REVENUE_PRODUCTION_30D, 180_000),
  ];

  it("produces identical output across repeated calls", () => {
    expect(calibrateThresholds(metrics)).toEqual(calibrateThresholds(metrics));
  });

  it("is insensitive to the order metrics arrive in", () => {
    expect(calibrateThresholds([...metrics].reverse())).toEqual(calibrateThresholds(metrics));
  });

  it("reports a plain-language basis for every threshold it changed", () => {
    const { overrides, applied } = calibrateThresholds(metrics);
    const changed = [
      ...Object.values((overrides as Record<string, Record<string, number>>).appointments ?? {}),
      ...Object.values((overrides as Record<string, Record<string, number>>).revenue ?? {}),
      ...Object.values((overrides as Record<string, Record<string, number>>).treatment ?? {}),
    ];
    expect(applied).toHaveLength(changed.length);
    for (const entry of applied) {
      expect(entry.basis.length).toBeGreaterThan(10);
      expect(entry.path).toContain(".");
      expect(entry.value).toBeGreaterThan(0);
    }
  });

  it("does not mutate the shared defaults", () => {
    const before = DEFAULT_SIGNAL_THRESHOLDS.appointments.minimumDailyAppointments;
    mergeOverrides(DEFAULT_SIGNAL_THRESHOLDS, calibrateThresholds(metrics).overrides);
    expect(DEFAULT_SIGNAL_THRESHOLDS.appointments.minimumDailyAppointments).toBe(before);
  });
});
