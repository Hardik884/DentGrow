/**
 * Unit tests for the DentGrow Metrics Engine.
 *
 * These tests are pure and deterministic — they use an in-memory fake
 * repository, never the database.
 */

import { describe, it, expect } from "vitest";
import { DentGrowMetricsEngine } from "./metrics-engine";
import { MetricKey } from "./metric-ids";
import { MetricUnit } from "../../domain";
import type {
  ClinicDataSnapshot,
  MetricsDataRepository,
} from "../../repositories";
import type { ExecutionContext } from "../../types";

const CLINIC_ID = "clinic-1";
const DATE = "2026-07-23";
const AS_OF = "2026-07-23T10:00:00.000Z";

/** Build a snapshot, defaulting every collection to empty. */
function makeSnapshot(overrides: Partial<ClinicDataSnapshot> = {}): ClinicDataSnapshot {
  return {
    clinicId: CLINIC_ID,
    date: DATE,
    asOf: AS_OF,
    appointmentsToday: [],
    patientsRegisteredToday: [],
    patientsSeenToday: [],
    treatments: [],
    payments: [],
    queueToday: [],
    followUps: [],
    capacity: { totalSlotsToday: 0 },
    ...overrides,
  };
}

/** A repository that returns a fixed snapshot. */
function repoOf(snapshot: ClinicDataSnapshot): MetricsDataRepository {
  return {
    getClinicSnapshot: async () => snapshot,
  };
}

/** Find a metric's value by its metric key. */
function valueOf(
  metrics: ReadonlyArray<{ id: string; value: number }>,
  key: MetricKey,
): number {
  const metric = metrics.find((m) => m.id.startsWith(`${key}:`));
  if (!metric) {
    throw new Error(`metric not found: ${key}`);
  }
  return metric.value;
}

const context: ExecutionContext = {
  clinicId: CLINIC_ID,
  correlationId: "test-corr",
  startedAt: AS_OF,
};

describe("DentGrowMetricsEngine — empty clinic", () => {
  it("produces every metric with safe zero values and never throws", async () => {
    const engine = new DentGrowMetricsEngine(repoOf(makeSnapshot()));
    const metrics = await engine.calculateMetrics(CLINIC_ID, DATE);

    // All 18 metrics present.
    expect(metrics).toHaveLength(18);
    // Every metric is zero for an empty clinic.
    for (const m of metrics) {
      expect(m.value).toBe(0);
    }
    // Chair utilization must not divide by zero.
    expect(valueOf(metrics, MetricKey.CAPACITY_CHAIR_UTILIZATION)).toBe(0);
    expect(valueOf(metrics, MetricKey.QUEUE_AVERAGE_WAITING_TIME)).toBe(0);
  });

  it("stamps metrics deterministically with the snapshot's asOf and stable ids", async () => {
    const engine = new DentGrowMetricsEngine(repoOf(makeSnapshot()));
    const first = await engine.calculateMetrics(CLINIC_ID, DATE);
    const second = await engine.calculateMetrics(CLINIC_ID, DATE);

    expect(first).toEqual(second); // deterministic
    for (const m of first) {
      expect(m.timestamp).toBe(AS_OF);
      expect(m.id.endsWith(`:${CLINIC_ID}:${DATE}`)).toBe(true);
    }
  });
});

describe("DentGrowMetricsEngine — normal clinic", () => {
  const snapshot = makeSnapshot({
    appointmentsToday: [
      { id: "a1", patientId: "p1", status: "completed", scheduledAt: `${DATE}T09:00:00Z`, durationMinutes: 30, source: "walk_in" },
      { id: "a2", patientId: "p2", status: "scheduled", scheduledAt: `${DATE}T11:00:00Z`, durationMinutes: 30, source: "phone_call" },
      { id: "a3", patientId: "p3", status: "checked_in", scheduledAt: `${DATE}T11:30:00Z`, durationMinutes: 30, source: "website" },
      { id: "a4", patientId: "p4", status: "cancelled", scheduledAt: `${DATE}T12:00:00Z`, durationMinutes: 30, source: "referral" },
      { id: "a5", patientId: "p5", status: "no_show", scheduledAt: `${DATE}T13:00:00Z`, durationMinutes: 30, source: "other" },
    ],
    patientsRegisteredToday: [
      { id: "p1", createdAt: `${DATE}T08:00:00Z` },
      { id: "p6", createdAt: `${DATE}T08:30:00Z` },
    ],
    patientsSeenToday: [
      { id: "p1", createdAt: `${DATE}T08:00:00Z` }, // new today -> not returning
      { id: "p2", createdAt: "2025-01-01T08:00:00Z" }, // returning
      { id: "p3", createdAt: "2024-06-01T08:00:00Z" }, // returning
    ],
    treatments: [
      { id: "t1", cost: 1000, status: "completed", performedAt: `${DATE}T09:30:00Z`, isScheduled: true },
      { id: "t2", cost: 500, status: "planned", performedAt: null, isScheduled: false },
      { id: "t3", cost: 800, status: "in_progress", performedAt: null, isScheduled: true },
      { id: "t4", cost: 200, status: "cancelled", performedAt: null, isScheduled: false },
      { id: "t5", cost: 300, status: "completed", performedAt: "2026-07-22T09:30:00Z", isScheduled: true },
    ],
    payments: [
      { id: "pay1", amount: 400, paymentDate: DATE },
      { id: "pay2", amount: 100, paymentDate: DATE },
      { id: "pay3", amount: 250, paymentDate: "2026-07-22" },
    ],
    queueToday: [
      { id: "q1", status: "waiting", checkedInAt: `${DATE}T09:50:00Z`, startedAt: null }, // 10 min to asOf
      { id: "q2", status: "in_progress", checkedInAt: `${DATE}T09:30:00Z`, startedAt: `${DATE}T09:45:00Z` }, // 15 min
    ],
    followUps: [
      { id: "f1", dueDate: DATE, status: "pending" }, // due today
      { id: "f2", dueDate: "2026-07-20", status: "pending" }, // overdue
      { id: "f3", dueDate: "2026-07-10", status: "completed" }, // ignored
      { id: "f4", dueDate: DATE, status: "cancelled" }, // ignored
    ],
    capacity: { totalSlotsToday: 10 },
  });

  it("calculates appointment metrics", async () => {
    const engine = new DentGrowMetricsEngine(repoOf(snapshot));
    const m = await engine.calculateMetrics(CLINIC_ID, DATE);

    expect(valueOf(m, MetricKey.APPOINTMENTS_TOTAL_TODAY)).toBe(5);
    expect(valueOf(m, MetricKey.APPOINTMENTS_COMPLETED_TODAY)).toBe(1);
    expect(valueOf(m, MetricKey.APPOINTMENTS_UPCOMING_TODAY)).toBe(2); // scheduled + checked_in
    expect(valueOf(m, MetricKey.APPOINTMENTS_CANCELLED_TODAY)).toBe(1);
    expect(valueOf(m, MetricKey.APPOINTMENTS_NO_SHOWS_TODAY)).toBe(1);
  });

  it("calculates patient metrics", async () => {
    const engine = new DentGrowMetricsEngine(repoOf(snapshot));
    const m = await engine.calculateMetrics(CLINIC_ID, DATE);

    expect(valueOf(m, MetricKey.PATIENTS_NEW_TODAY)).toBe(2);
    expect(valueOf(m, MetricKey.PATIENTS_RETURNING_TODAY)).toBe(2); // p2, p3
  });

  it("calculates revenue metrics", async () => {
    const engine = new DentGrowMetricsEngine(repoOf(snapshot));
    const m = await engine.calculateMetrics(CLINIC_ID, DATE);

    // Collected today: 400 + 100 (250 is yesterday).
    expect(valueOf(m, MetricKey.REVENUE_COLLECTED_TODAY)).toBe(500);
    // Billed (non-cancelled): 1000 + 500 + 800 + 300 = 2600; collected all: 750 -> 1850.
    expect(valueOf(m, MetricKey.REVENUE_OUTSTANDING)).toBe(1850);
    // Pending (planned + in_progress): 500 + 800 = 1300.
    expect(valueOf(m, MetricKey.REVENUE_PENDING_TREATMENT_VALUE)).toBe(1300);
  });

  it("calculates queue metrics", async () => {
    const engine = new DentGrowMetricsEngine(repoOf(snapshot));
    const m = await engine.calculateMetrics(CLINIC_ID, DATE);

    expect(valueOf(m, MetricKey.QUEUE_PATIENTS_WAITING)).toBe(1);
    // (10 + 15) / 2 = 12.5 minutes.
    expect(valueOf(m, MetricKey.QUEUE_AVERAGE_WAITING_TIME)).toBe(12.5);
  });

  it("calculates follow-up metrics", async () => {
    const engine = new DentGrowMetricsEngine(repoOf(snapshot));
    const m = await engine.calculateMetrics(CLINIC_ID, DATE);

    expect(valueOf(m, MetricKey.FOLLOWUPS_DUE_TODAY)).toBe(1);
    expect(valueOf(m, MetricKey.FOLLOWUPS_OVERDUE)).toBe(1);
  });

  it("calculates treatment metrics", async () => {
    const engine = new DentGrowMetricsEngine(repoOf(snapshot));
    const m = await engine.calculateMetrics(CLINIC_ID, DATE);

    expect(valueOf(m, MetricKey.TREATMENT_ACCEPTED_PENDING_SCHEDULING)).toBe(1); // t2
    expect(valueOf(m, MetricKey.TREATMENT_COMPLETED_TODAY)).toBe(1); // t1 (t5 is yesterday)
  });

  it("calculates capacity metrics", async () => {
    const engine = new DentGrowMetricsEngine(repoOf(snapshot));
    const m = await engine.calculateMetrics(CLINIC_ID, DATE);

    // Booked = appointments excluding cancelled + no_show = 3; total = 10 -> 30%.
    expect(valueOf(m, MetricKey.CAPACITY_CHAIR_UTILIZATION)).toBe(30);
    expect(valueOf(m, MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY)).toBe(7);
  });

  it("uses currency/percentage/minutes units on the right metrics", async () => {
    const engine = new DentGrowMetricsEngine(repoOf(snapshot));
    const m = await engine.calculateMetrics(CLINIC_ID, DATE);

    const byKey = (key: MetricKey) => m.find((x) => x.id.startsWith(`${key}:`))!;
    expect(byKey(MetricKey.REVENUE_COLLECTED_TODAY).unit).toBe(MetricUnit.CURRENCY);
    expect(byKey(MetricKey.CAPACITY_CHAIR_UTILIZATION).unit).toBe(MetricUnit.PERCENTAGE);
    expect(byKey(MetricKey.QUEUE_AVERAGE_WAITING_TIME).unit).toBe(MetricUnit.MINUTES);
  });
});

describe("DentGrowMetricsEngine — edge cases", () => {
  it("caps chair utilization at 100% when overbooked", async () => {
    const snapshot = makeSnapshot({
      appointmentsToday: [
        { id: "a1", patientId: "p1", status: "scheduled", scheduledAt: `${DATE}T09:00:00Z`, durationMinutes: 30, source: "walk_in" },
        { id: "a2", patientId: "p2", status: "scheduled", scheduledAt: `${DATE}T09:00:00Z`, durationMinutes: 30, source: "walk_in" },
        { id: "a3", patientId: "p3", status: "scheduled", scheduledAt: `${DATE}T09:00:00Z`, durationMinutes: 30, source: "walk_in" },
      ],
      capacity: { totalSlotsToday: 2 },
    });
    const engine = new DentGrowMetricsEngine(repoOf(snapshot));
    const m = await engine.calculateMetrics(CLINIC_ID, DATE);

    expect(valueOf(m, MetricKey.CAPACITY_CHAIR_UTILIZATION)).toBe(100);
    expect(valueOf(m, MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY)).toBe(0); // floored
  });

  it("floors outstanding payments at zero when overpaid", async () => {
    const snapshot = makeSnapshot({
      treatments: [{ id: "t1", cost: 100, status: "completed", performedAt: `${DATE}T09:00:00Z`, isScheduled: true }],
      payments: [{ id: "pay1", amount: 500, paymentDate: DATE }],
    });
    const engine = new DentGrowMetricsEngine(repoOf(snapshot));
    const m = await engine.calculateMetrics(CLINIC_ID, DATE);

    expect(valueOf(m, MetricKey.REVENUE_OUTSTANDING)).toBe(0);
  });

  it("skips queue entries with invalid timestamps without throwing", async () => {
    const snapshot = makeSnapshot({
      queueToday: [
        { id: "q1", status: "in_progress", checkedInAt: "not-a-date", startedAt: `${DATE}T09:45:00Z` },
        { id: "q2", status: "in_progress", checkedInAt: `${DATE}T09:30:00Z`, startedAt: `${DATE}T09:40:00Z` }, // 10 min
      ],
    });
    const engine = new DentGrowMetricsEngine(repoOf(snapshot));
    const m = await engine.calculateMetrics(CLINIC_ID, DATE);

    // Only the valid entry counts -> average 10.
    expect(valueOf(m, MetricKey.QUEUE_AVERAGE_WAITING_TIME)).toBe(10);
  });
});

describe("DentGrowMetricsEngine — missing data & error handling", () => {
  it("returns partial (empty-safe) results for a sparse snapshot", async () => {
    const snapshot = makeSnapshot({
      appointmentsToday: [
        { id: "a1", patientId: "p1", status: "completed", scheduledAt: `${DATE}T09:00:00Z`, durationMinutes: 30, source: "walk_in" },
      ],
      // everything else intentionally empty
    });
    const engine = new DentGrowMetricsEngine(repoOf(snapshot));
    const m = await engine.calculateMetrics(CLINIC_ID, DATE);

    expect(m).toHaveLength(18);
    expect(valueOf(m, MetricKey.APPOINTMENTS_COMPLETED_TODAY)).toBe(1);
    expect(valueOf(m, MetricKey.REVENUE_COLLECTED_TODAY)).toBe(0);
    expect(valueOf(m, MetricKey.CAPACITY_CHAIR_UTILIZATION)).toBe(0);
  });

  it("execute() returns a success envelope with the metrics", async () => {
    const engine = new DentGrowMetricsEngine(repoOf(makeSnapshot()));
    const result = await engine.execute({ date: DATE }, context);

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(18);
    expect(result.error).toBeUndefined();
  });

  it("execute() returns an error envelope when the repository fails", async () => {
    const failingRepo: MetricsDataRepository = {
      getClinicSnapshot: async () => {
        throw new Error("db down");
      },
    };
    const engine = new DentGrowMetricsEngine(failingRepo);
    const result = await engine.execute({ date: DATE }, context);

    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("METRICS_DATA_UNAVAILABLE");
  });
});
