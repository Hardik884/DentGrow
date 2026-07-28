import { describe, expect, it } from "vitest";

import { MetricCategory, MetricUnit } from "../../../domain";
import { METRIC_CALCULATORS } from "../calculators";
import { METRIC_DESCRIPTORS, MetricKey, buildMetric } from "../metric-ids";
import { AS_OF, CLINIC, DATE, snapshot } from "./fixtures/snapshot-fixtures";

const ALL_KEYS = Object.values(MetricKey);

describe("metric manifest", () => {
  it("has a descriptor for every key, keyed by itself", () => {
    for (const key of ALL_KEYS) {
      const d = METRIC_DESCRIPTORS[key];
      expect(d, `missing descriptor for ${key}`).toBeDefined();
      expect(d.key).toBe(key);
      expect(d.name.length).toBeGreaterThan(0);
      expect(Object.values(MetricCategory)).toContain(d.category);
      expect(Object.values(MetricUnit)).toContain(d.unit);
    }
  });

  it("registers exactly one calculator per metric key", () => {
    // Guards the most likely mistake: adding a key without a calculator, or a
    // calculator without a key. Both leave a metric silently missing at runtime.
    expect(METRIC_CALCULATORS.length).toBe(ALL_KEYS.length);
  });

  it("produces every declared key exactly once for a measurable snapshot", () => {
    // An empty clinic day is fully measurable: nothing is unknown, so every
    // calculator returns a metric rather than withholding.
    const s = snapshot();
    const produced = METRIC_CALCULATORS.map((c) => c(s)?.id.split(":")[0]);
    expect(produced.every((key) => key !== undefined)).toBe(true);
    expect(produced.length).toBe(new Set(produced).size);
    expect([...produced].sort()).toEqual([...ALL_KEYS].sort());
  });

  it("keys are unique and namespaced", () => {
    expect(new Set(ALL_KEYS).size).toBe(ALL_KEYS.length);
    for (const key of ALL_KEYS) {
      expect(key, `${key} should be namespaced as <group>.<name>`).toMatch(
        /^[a-z]+\.[a-z0-9_]+$/,
      );
    }
  });
});

describe("buildMetric", () => {
  it("builds a deterministic id from key, clinic and date", () => {
    const m = buildMetric(MetricKey.REVENUE_OUTSTANDING, 500, CLINIC, DATE, AS_OF);
    expect(m.id).toBe(`revenue.outstanding:${CLINIC}:${DATE}`);
  });

  it("is byte-identical across repeated calls", () => {
    const a = buildMetric(MetricKey.PATIENTS_NEW_TODAY, 3, CLINIC, DATE, AS_OF);
    const b = buildMetric(MetricKey.PATIENTS_NEW_TODAY, 3, CLINIC, DATE, AS_OF);
    expect(a).toEqual(b);
  });

  it("carries name, unit and category from the descriptor", () => {
    const m = buildMetric(MetricKey.CAPACITY_CHAIR_UTILIZATION, 40, CLINIC, DATE, AS_OF);
    expect(m.name).toBe("Chair Utilization");
    expect(m.unit).toBe(MetricUnit.PERCENTAGE);
    expect(m.category).toBe(MetricCategory.UTILIZATION);
  });

  it("scopes the id per clinic and per day so re-runs overwrite, never duplicate", () => {
    const a = buildMetric(MetricKey.REVENUE_OUTSTANDING, 1, "clinic_a", DATE, AS_OF);
    const b = buildMetric(MetricKey.REVENUE_OUTSTANDING, 1, "clinic_b", DATE, AS_OF);
    const c = buildMetric(MetricKey.REVENUE_OUTSTANDING, 1, "clinic_a", "2026-07-29", AS_OF);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
  });

  it("stamps the metric with the supplied capture time, not the clock", () => {
    const m = buildMetric(MetricKey.QUEUE_PATIENTS_WAITING, 0, CLINIC, DATE, AS_OF);
    expect(m.timestamp).toBe(AS_OF);
  });
});
