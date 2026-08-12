/**
 * Midnight-UTC boundary for the clinic-local business day.
 *
 * `payments.payment_date` and `queue_entries.queue_date` default to Postgres
 * `current_date` (UTC). The write paths now derive the date from the clinic's
 * configured timezone via `getTodayInTimezone` instead, so a payment or check-in
 * recorded near local midnight lands on the correct business day. These pin the
 * helper that makes that correct at the exact UTC boundary a UTC default gets wrong.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { getTodayInTimezone } from "@/lib/utils";

describe("clinic-local today at the UTC midnight boundary", () => {
  afterEach(() => vi.useRealTimers());

  it("stamps the local business day for a clinic AHEAD of UTC (Asia/Kolkata, +5:30)", () => {
    vi.useFakeTimers();
    // 20:00 UTC is 01:30 IST the NEXT calendar day.
    vi.setSystemTime(new Date("2026-08-11T20:00:00Z"));
    expect(getTodayInTimezone("Asia/Kolkata")).toBe("2026-08-12");
    // The old UTC default (Postgres current_date / new Date().toISOString()) would
    // have stamped the previous day — the bug this fix removes.
    expect(getTodayInTimezone("UTC")).toBe("2026-08-11");
  });

  it("stamps the previous local day for a clinic BEHIND UTC (America/Los_Angeles, -7)", () => {
    vi.useFakeTimers();
    // 04:00 UTC on the 12th is 21:00 PDT on the 11th.
    vi.setSystemTime(new Date("2026-08-12T04:00:00Z"));
    expect(getTodayInTimezone("America/Los_Angeles")).toBe("2026-08-11");
    expect(getTodayInTimezone("UTC")).toBe("2026-08-12");
  });
});
