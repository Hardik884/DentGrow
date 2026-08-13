/**
 * Specs for `countOperatingDays`/`isOperatingDay` — the correct denominator
 * for a "per day" average (audit B6).
 *
 * The property worth pinning: a calendar-day count overstates the average by
 * including days the clinic is closed, and counting only days that happened
 * to have activity understates it by excluding open-but-quiet days. Operating
 * days is neither — it is "did the clinic INTEND to be open", independent of
 * whether anything was actually booked.
 */

import { describe, expect, it } from "vitest";

import { countOperatingDays, isOperatingDay, type AvailabilityRule } from "../slots";

function rule(dayOfWeek: number): [number, AvailabilityRule[]] {
  return [dayOfWeek, [{ startTime: "09:00", endTime: "17:00", slotDurationMinutes: 30 }]];
}

describe("isOperatingDay", () => {
  it("is open on a weekday with an active rule", () => {
    // 2026-08-10 is a Monday.
    const rules = new Map([rule(1)]);
    expect(isOperatingDay("2026-08-10", rules, new Set())).toBe(true);
  });

  it("is closed on a weekday with no rule at all", () => {
    // Tuesday has no rule in this map.
    const rules = new Map([rule(1)]);
    expect(isOperatingDay("2026-08-11", rules, new Set())).toBe(false);
  });

  it("is closed on a date explicitly marked unavailable, even with an active rule", () => {
    const rules = new Map([rule(1)]); // Monday open
    const closed = new Set(["2026-08-10"]); // this Monday is a holiday
    expect(isOperatingDay("2026-08-10", rules, closed)).toBe(false);
  });
});

describe("countOperatingDays", () => {
  it("counts only the weekdays with an active rule, excluding closed days", () => {
    // Mon–Fri open (1–5), Sat/Sun closed. One week: 2026-08-10 (Mon) .. 2026-08-16 (Sun).
    const rules = new Map([rule(1), rule(2), rule(3), rule(4), rule(5)]);
    expect(countOperatingDays("2026-08-10", "2026-08-16", rules, new Set())).toBe(5);
  });

  it("excludes a whole-day closure even on an otherwise-open weekday", () => {
    const rules = new Map([rule(1), rule(2), rule(3), rule(4), rule(5)]);
    const closed = new Set(["2026-08-12"]); // Wednesday holiday
    expect(countOperatingDays("2026-08-10", "2026-08-16", rules, closed)).toBe(4);
  });

  it("never counts a closed day as a zero-revenue operating day", () => {
    // A clinic open only Saturdays: 30-day range should count roughly 4-5
    // Saturdays, not 30 calendar days and not 0.
    const rules = new Map([rule(6)]); // Saturday only
    const count = countOperatingDays("2026-08-01", "2026-08-30", rules, new Set());
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(6);
    expect(count).not.toBe(30);
  });

  it("returns 0 for a clinic with no active rules at all", () => {
    expect(countOperatingDays("2026-08-01", "2026-08-30", new Map(), new Set())).toBe(0);
  });

  it("is inclusive of both range endpoints", () => {
    const rules = new Map([rule(1)]); // Monday only
    // 2026-08-10 and 2026-08-17 are both Mondays, one week apart.
    expect(countOperatingDays("2026-08-10", "2026-08-17", rules, new Set())).toBe(2);
  });

  it("handles a single-day range", () => {
    const rules = new Map([rule(1)]);
    expect(countOperatingDays("2026-08-10", "2026-08-10", rules, new Set())).toBe(1);
    expect(countOperatingDays("2026-08-11", "2026-08-11", rules, new Set())).toBe(0);
  });
});
