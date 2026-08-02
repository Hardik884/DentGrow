/**
 * Specs for `daysBetween`, the helper that replaced several places computing
 * "days until/since a due date" via `new Date(dueDate) < new Date()` at
 * render time.
 *
 * That pattern had a real bug: on Vercel, `new Date()` inside a Server
 * Component resolves in the SERVER's system timezone (UTC), not the clinic's.
 * A follow-up due "today" in a clinic ahead of UTC could read as overdue for
 * part of the day, because the UTC calendar date and the clinic's calendar
 * date briefly disagree.
 *
 * `daysBetween` sidesteps the whole class of bug by working on "YYYY-MM-DD"
 * strings only — there is no "now" involved in comparing two calendar dates,
 * so there is nothing for a server's timezone to get wrong.
 */

import { describe, expect, it } from "vitest";

import { daysBetween } from "../utils";

describe("daysBetween", () => {
  it("is zero for the same date", () => {
    expect(daysBetween("2026-08-03", "2026-08-03")).toBe(0);
  });

  it("is positive when `to` is later", () => {
    expect(daysBetween("2026-08-03", "2026-08-10")).toBe(7);
  });

  it("is negative when `to` is earlier", () => {
    expect(daysBetween("2026-08-10", "2026-08-03")).toBe(-7);
  });

  it("crosses a month boundary correctly", () => {
    expect(daysBetween("2026-07-28", "2026-08-03")).toBe(6);
  });

  it("crosses a year boundary correctly", () => {
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
  });

  it("handles a leap-year February correctly", () => {
    // 2028 is a leap year.
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("is unaffected by any ambient timezone", () => {
    // Regression guard for the exact bug this replaced: the two dates parse as
    // UTC midnight regardless of the machine running the test, so the result
    // must be identical everywhere.
    const originalTZ = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Kiritimati"; // UTC+14, one of the furthest-ahead zones
      const a = daysBetween("2026-08-03", "2026-08-10");
      process.env.TZ = "Etc/GMT+12"; // UTC-12, one of the furthest-behind zones
      const b = daysBetween("2026-08-03", "2026-08-10");
      expect(a).toBe(7);
      expect(b).toBe(7);
    } finally {
      process.env.TZ = originalTZ;
    }
  });
});
