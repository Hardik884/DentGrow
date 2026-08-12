/**
 * Regression: the appointments list/calendar date filter must bound a
 * CLINIC-LOCAL day, not a UTC day (audit A14). Uses a chainable mock so it runs
 * without a database, and asserts the exact UTC instants sent to Postgres for an
 * Asia/Kolkata (+5:30) clinic.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ resolveSession: vi.fn() }));

import { resolveSession } from "@/lib/auth/session";
import { getAppointments } from "@/actions/appointments";

const CLINIC = "clinic-1";

/** Chainable, thenable query mock that records the scheduled_at gte/lte bounds. */
function makeDb(timezone: string | null, captured: { gte?: string; lte?: string }) {
  function builder(table: string) {
    let single = false;
    const api: Record<string, unknown> = {
      select: () => api,
      is: () => api,
      order: () => api,
      eq: () => api,
      in: () => api,
      gte: (col: string, val: string) => {
        if (col === "scheduled_at") captured.gte = val;
        return api;
      },
      lte: (col: string, val: string) => {
        if (col === "scheduled_at") captured.lte = val;
        return api;
      },
      maybeSingle: () => {
        single = true;
        return api;
      },
      range: () => Promise.resolve({ data: [], count: 0, error: null }),
      then: (onResolve: (v: unknown) => unknown) => {
        const value =
          table === "clinic_settings"
            ? { data: single ? { timezone } : { timezone }, error: null }
            : { data: [], count: 0, error: null };
        return Promise.resolve(value).then(onResolve);
      },
    };
    return api;
  }
  return { from: (table: string) => builder(table) };
}

function asStaff(timezone: string | null, captured: { gte?: string; lte?: string }) {
  (resolveSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    db: makeDb(timezone, captured),
    profile: { id: "u1", clinic_id: CLINIC, role: "dentist" },
  });
}

beforeEach(() => vi.clearAllMocks());

describe("getAppointments date filter (audit A14)", () => {
  it("bounds a single clinic-local day in the clinic timezone (Asia/Kolkata)", async () => {
    const captured: { gte?: string; lte?: string } = {};
    asStaff("Asia/Kolkata", captured);

    await getAppointments({ dateFrom: "2026-08-13", dateTo: "2026-08-13" });

    // Aug 13 00:00 IST == Aug 12 18:30 UTC; Aug 13 23:59:59 IST == Aug 13 18:29:59 UTC.
    expect(captured.gte).toBe("2026-08-12T18:30:00.000Z");
    expect(captured.lte).toBe("2026-08-13T18:29:59.000Z");
    // The naive-UTC bug would have sent these instead:
    expect(captured.gte).not.toBe("2026-08-13T00:00:00");
  });

  it("falls back to the default timezone when the clinic has none set", async () => {
    const captured: { gte?: string; lte?: string } = {};
    asStaff(null, captured); // DEFAULT_TIMEZONE is Asia/Kolkata
    await getAppointments({ dateFrom: "2026-08-13", dateTo: "2026-08-13" });
    expect(captured.gte).toBe("2026-08-12T18:30:00.000Z");
  });
});
