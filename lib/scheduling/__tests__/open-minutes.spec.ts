/**
 * Specs for `openMinutes` — how much chair time a clinic actually offers.
 *
 * This exists because the capacity metrics used to count the entries
 * `getAvailableSlots` returns, and those are candidate START TIMES stepped at
 * `slot_duration_minutes`, not units of capacity. They overlap, so the count ran
 * several times higher than the real hours, and by a factor that changed with
 * the step — which made the same clinic read differently on different weekdays.
 *
 * The two properties worth pinning down are therefore: open time must be
 * INDEPENDENT of the step size, and overlapping rules must be UNIONED rather
 * than added.
 */

import { describe, expect, it } from "vitest";

import { openMinutes, type AvailabilityRule } from "../slots";

function rule(startTime: string, endTime: string, slotDurationMinutes = 30): AvailabilityRule {
  return { startTime, endTime, slotDurationMinutes };
}

describe("openMinutes", () => {
  it("measures the length of a single window", () => {
    expect(openMinutes([rule("09:00", "13:00")])).toBe(240);
  });

  it("is unaffected by the slot step size", () => {
    // The whole point. Four hours is four hours whether the booking screen
    // offers starts every 10 minutes or every hour.
    const window = ["09:00", "13:00"] as const;
    for (const step of [5, 10, 15, 30, 60]) {
      expect(openMinutes([rule(...window, step)])).toBe(240);
    }
  });

  it("adds windows that do not touch", () => {
    expect(openMinutes([rule("09:00", "13:00"), rule("14:00", "18:00")])).toBe(480);
  });

  it("UNIONS overlapping rules instead of double-counting the overlap", () => {
    // Real production data has rules like these. Summing them reports 13 hours
    // of chair time in a 9-hour day.
    expect(openMinutes([rule("09:00", "13:00"), rule("09:00", "18:00")])).toBe(540);
  });

  it("merges windows that meet exactly, without gaining or losing a minute", () => {
    expect(openMinutes([rule("09:00", "12:00"), rule("12:00", "15:00")])).toBe(360);
  });

  it("is insensitive to the order rules arrive in", () => {
    const rules = [rule("14:00", "18:00"), rule("09:00", "13:00"), rule("10:00", "16:00")];
    expect(openMinutes(rules)).toBe(openMinutes([...rules].reverse()));
    expect(openMinutes(rules)).toBe(540);
  });

  it("ignores a rule that ends before it starts rather than going negative", () => {
    expect(openMinutes([rule("13:00", "09:00")])).toBe(0);
    expect(openMinutes([rule("13:00", "09:00"), rule("09:00", "13:00")])).toBe(240);
  });

  it("reports nothing for a day with no rules", () => {
    expect(openMinutes([])).toBe(0);
  });

  describe("consultancy blocks", () => {
    it("subtracts a block that falls inside the window", () => {
      expect(openMinutes([rule("09:00", "13:00")], [{ start: "10:00", end: "11:00" }])).toBe(180);
    });

    it("subtracts only the overlapping part of a block that runs past the edge", () => {
      expect(openMinutes([rule("09:00", "13:00")], [{ start: "12:00", end: "15:00" }])).toBe(180);
    });

    it("ignores a block entirely outside opening hours", () => {
      expect(openMinutes([rule("09:00", "13:00")], [{ start: "14:00", end: "16:00" }])).toBe(240);
    });

    it("counts overlapping blocks once, not twice", () => {
      // Two consultants blocking the same hour do not consume two hours.
      expect(
        openMinutes(
          [rule("09:00", "13:00")],
          [
            { start: "10:00", end: "11:30" },
            { start: "10:30", end: "12:00" },
          ],
        ),
      ).toBe(120);
    });

    it("subtracts a block from every window it overlaps", () => {
      expect(
        openMinutes(
          [rule("09:00", "12:00"), rule("14:00", "17:00")],
          [{ start: "11:00", end: "15:00" }],
        ),
      ).toBe(240);
    });

    it("floors at zero when a block covers the whole day", () => {
      expect(openMinutes([rule("09:00", "13:00")], [{ start: "08:00", end: "20:00" }])).toBe(0);
    });

    it("treats an absent block list the same as an empty one", () => {
      expect(openMinutes([rule("09:00", "13:00")])).toBe(
        openMinutes([rule("09:00", "13:00")], []),
      );
    });
  });
});
