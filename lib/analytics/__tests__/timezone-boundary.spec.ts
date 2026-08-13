/**
 * Regression: analytics range filters and per-day buckets must use the clinic's
 * timezone, not UTC (audit A16). The analytics builders take the Supabase client
 * directly, so a chainable mock exercises them without a database — it records
 * the scheduled_at bounds sent to Postgres and feeds back a boundary-straddling
 * appointment to check which day it lands on.
 */

import { describe, expect, it } from "vitest";

import { getAppointmentAnalytics } from "@/lib/analytics/queries";

/**
 * Chainable, thenable mock over a fixed appointment row set. Table-aware:
 * `getAppointmentAnalytics` also fetches `availability_rules`/
 * `unavailable_dates` for its operating-day denominator (audit B6) — those
 * must resolve to empty arrays here, not the appointment rows, or a real
 * row's `start_time` (absent on an appointment) breaks the operating-day
 * calculation this test never intends to exercise.
 */
function mockSupabase(rows: Array<Record<string, unknown>>, captured: { gte?: string; lte?: string }) {
  function builder(table: string) {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      is: () => api,
      gte: (col: string, val: string) => {
        if (col === "scheduled_at") captured.gte = val;
        return api;
      },
      lte: (col: string, val: string) => {
        if (col === "scheduled_at") captured.lte = val;
        return api;
      },
      then: (onResolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: table === "appointments" ? rows : [], error: null }).then(onResolve),
    };
    return api;
  }
  return { from: (table: string) => builder(table) };
}

describe("analytics timezone boundary (audit A16)", () => {
  // 2026-08-12 20:00 UTC == 2026-08-13 01:30 IST — a locally-Aug-13 appointment.
  const row = { status: "scheduled", scheduled_at: "2026-08-12T20:00:00Z", source: "walk_in" };

  it("bounds the range in the clinic timezone and buckets the row on the local day", async () => {
    const captured: { gte?: string; lte?: string } = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = mockSupabase([row], captured) as any;

    const result = await getAppointmentAnalytics(supabase, {
      clinicId: "c1",
      dateFrom: "2026-08-13",
      dateTo: "2026-08-13",
      timezone: "Asia/Kolkata",
    });

    // Range bounds are the clinic-local day expressed in UTC.
    expect(captured.gte).toBe("2026-08-12T18:30:00.000Z");
    expect(captured.lte).toBe("2026-08-13T18:29:59.999Z");

    // The 20:00 UTC appointment is bucketed on the clinic-local day (Aug 13),
    // not the UTC day (Aug 12) that `.split("T")[0]` would have produced.
    expect(result.byStatus).toEqual([{ date: "2026-08-13", status: "scheduled", count: 1 }]);
  });

  it("uses UTC-day bounds when the timezone is UTC (control)", async () => {
    const captured: { gte?: string; lte?: string } = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = mockSupabase([row], captured) as any;

    const result = await getAppointmentAnalytics(supabase, {
      clinicId: "c1",
      dateFrom: "2026-08-13",
      dateTo: "2026-08-13",
      timezone: "UTC",
    });

    expect(captured.gte).toBe("2026-08-13T00:00:00.000Z");
    // Under UTC the same row buckets on Aug 12 — the behaviour the clinic-tz fix corrects.
    expect(result.byStatus).toEqual([{ date: "2026-08-12", status: "scheduled", count: 1 }]);
  });
});
