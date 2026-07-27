import { describe, expect, it } from "vitest";

import type { ExecutionContext } from "../../../types";
import type { ClinicDataSnapshot, MetricsDataRepository } from "../../../repositories";
import type { Logger } from "../../../utils";
import { DentGrowMetricsEngine } from "../metrics-engine";
import { MetricKey } from "../metric-ids";
import {
  AS_OF,
  CLINIC,
  DATE,
  appointment,
  payment,
  snapshot,
  treatment,
} from "./fixtures/snapshot-fixtures";

/** A repository that returns a fixed snapshot, or throws. */
function repo(result: ClinicDataSnapshot | Error): MetricsDataRepository {
  return {
    async getClinicSnapshot() {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

/** Collects log calls instead of writing to the console. */
function silentLogger(): Logger & { warns: number; errors: number } {
  const l = {
    warns: 0,
    errors: 0,
    debug: () => {},
    info: () => {},
    warn: () => {
      l.warns += 1;
    },
    error: () => {
      l.errors += 1;
    },
  };
  return l as Logger & { warns: number; errors: number };
}

const context: ExecutionContext = {
  clinicId: CLINIC,
  correlationId: "corr-1",
  startedAt: AS_OF,
};

const populated = snapshot({
  appointmentsToday: [appointment({ status: "completed" }), appointment({ status: "no_show" })],
  payments: [payment({ amount: 2500 })],
  treatments: [treatment({ cost: 4000, clinicShare: 4000, status: "completed" })],
  capacity: { totalSlotsToday: 8 },
});

function byKey(metrics: { id: string; value: number }[], key: string): number | undefined {
  return metrics.find((m) => m.id.startsWith(`${key}:`))?.value;
}

describe("DentGrowMetricsEngine", () => {
  it("returns one metric per calculator for a healthy snapshot", async () => {
    const engine = new DentGrowMetricsEngine(repo(populated), { logger: silentLogger() });
    const metrics = await engine.calculateMetrics(CLINIC, DATE);
    expect(metrics.length).toBeGreaterThan(0);
    expect(byKey(metrics, MetricKey.APPOINTMENTS_TOTAL_TODAY)).toBe(2);
    expect(byKey(metrics, MetricKey.REVENUE_COLLECTED_TODAY)).toBe(2500);
    expect(byKey(metrics, MetricKey.REVENUE_CLINIC_SHARE_TODAY)).toBe(4000);
    expect(byKey(metrics, MetricKey.CAPACITY_CHAIR_UTILIZATION)).toBe(12.5);
  });

  it("wraps a successful run in an ok EngineResult", async () => {
    const engine = new DentGrowMetricsEngine(repo(populated), { logger: silentLogger() });
    const result = await engine.execute({ date: DATE }, context);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.data?.length).toBeGreaterThan(0);
  });

  it("derives the clinic from the execution context, not the input", async () => {
    let askedFor: string | null = null;
    const spy: MetricsDataRepository = {
      async getClinicSnapshot(clinicId: string) {
        askedFor = clinicId;
        return populated;
      },
    };
    const engine = new DentGrowMetricsEngine(spy, { logger: silentLogger() });
    await engine.execute({ date: DATE }, { ...context, clinicId: "clinic_from_context" });
    expect(askedFor).toBe("clinic_from_context");
  });

  it("stamps every metric with the snapshot capture time, never the clock", async () => {
    const engine = new DentGrowMetricsEngine(repo(populated), { logger: silentLogger() });
    const metrics = await engine.calculateMetrics(CLINIC, DATE);
    for (const m of metrics) {
      expect(m.timestamp).toBe(AS_OF);
    }
  });

  it("produces byte-identical metrics across repeated runs", async () => {
    const engine = new DentGrowMetricsEngine(repo(populated), { logger: silentLogger() });
    const a = await engine.calculateMetrics(CLINIC, DATE);
    const b = await engine.calculateMetrics(CLINIC, DATE);
    expect(a).toEqual(b);
  });

  it("returns a typed error when the repository itself fails", async () => {
    const log = silentLogger();
    const engine = new DentGrowMetricsEngine(repo(new Error("connection refused")), {
      logger: log,
    });
    const result = await engine.execute({ date: DATE }, context);
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("METRICS_DATA_UNAVAILABLE");
    expect(result.error?.details).toContain("connection refused");
    expect(log.errors).toBe(1);
  });

  it("isolates a failing calculator and still returns the rest", async () => {
    // A malformed snapshot missing `treatments` makes every treatment-dependent
    // calculator throw. The run must survive and return the others rather than
    // losing the whole day's metrics to one bad collection.
    const malformed = {
      ...snapshot({ appointmentsToday: [appointment()], payments: [payment({ amount: 100 })] }),
      treatments: undefined,
    } as unknown as ClinicDataSnapshot;

    const log = silentLogger();
    const engine = new DentGrowMetricsEngine(repo(malformed), { logger: log });
    const metrics = await engine.calculateMetrics(CLINIC, DATE);

    // Survivors are present…
    expect(byKey(metrics, MetricKey.APPOINTMENTS_TOTAL_TODAY)).toBe(1);
    expect(byKey(metrics, MetricKey.REVENUE_COLLECTED_TODAY)).toBe(100);
    // …and the treatment-dependent ones are absent rather than wrong.
    expect(byKey(metrics, MetricKey.REVENUE_OUTSTANDING)).toBeUndefined();
    expect(byKey(metrics, MetricKey.TREATMENT_COMPLETED_TODAY)).toBeUndefined();
    // Each failure was logged, not swallowed silently.
    expect(log.warns).toBeGreaterThan(0);
  });

  it("still reports ok for a partial run — partial facts are not an error", async () => {
    const malformed = {
      ...snapshot(),
      treatments: undefined,
    } as unknown as ClinicDataSnapshot;
    const engine = new DentGrowMetricsEngine(repo(malformed), { logger: silentLogger() });
    const result = await engine.execute({ date: DATE }, context);
    expect(result.ok).toBe(true);
    expect(result.data?.length).toBeGreaterThan(0);
  });

  it("returns an empty-but-valid metric set for a clinic with no activity", async () => {
    const engine = new DentGrowMetricsEngine(repo(snapshot()), { logger: silentLogger() });
    const metrics = await engine.calculateMetrics(CLINIC, DATE);
    expect(metrics.length).toBeGreaterThan(0);
    for (const m of metrics) {
      expect(Number.isFinite(m.value)).toBe(true);
      expect(m.value).toBe(0);
    }
  });

  it("respects the enabled flag from construction options", () => {
    expect(new DentGrowMetricsEngine(repo(populated)).enabled).toBe(true);
    expect(new DentGrowMetricsEngine(repo(populated), { enabled: false }).enabled).toBe(false);
  });
});
