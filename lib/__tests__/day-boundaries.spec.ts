/**
 * Specs for clinic-local day boundaries.
 *
 * `getUtcBoundariesForLocalDate` decides which UTC instants belong to a clinic's
 * business day, and it is what every date-scoped query filters on — today's
 * appointments, the queue, availability, and every Business Brain snapshot. A
 * fault here misfiles records rather than failing loudly, so it is worth pinning
 * down precisely.
 *
 * The property that matters most is that consecutive days must ABUT: the next
 * day starts exactly one millisecond after this one ends. They used to overlap
 * by 999ms, because `Intl.DateTimeFormat` reports whole seconds and the
 * milliseconds of `23:59:59.999` were being folded into the computed timezone
 * offset. An event landing in the overlap belonged to two business days at once.
 */

import { describe, expect, it } from "vitest";

import { getUtcBoundariesForLocalDate } from "@/lib/utils";

const ZONES = [
  "Asia/Kolkata", // +5:30 — the pilot clinic, and a half-hour offset
  "UTC",
  "America/New_York", // negative offset, observes DST
  "Australia/Adelaide", // +9:30/+10:30, southern-hemisphere DST
  "Asia/Kathmandu", // +5:45 — quarter-hour offset
];

describe("getUtcBoundariesForLocalDate", () => {
  it("puts an IST day exactly where it belongs", () => {
    const { start, end } = getUtcBoundariesForLocalDate("2026-03-10", "Asia/Kolkata");
    expect(start).toBe("2026-03-09T18:30:00.000Z");
    expect(end).toBe("2026-03-10T18:29:59.999Z");
  });

  it("never lets one day overrun into the next", () => {
    // The regression. `end` used to be 18:30:00.998Z — past the next day's
    // start, so a record on the boundary was counted twice.
    const nextDay = (date: string) =>
      new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

    for (const zone of ZONES) {
      for (const date of ["2026-03-10", "2026-07-31", "2026-01-01"]) {
        const gap =
          Date.parse(getUtcBoundariesForLocalDate(nextDay(date), zone).start) -
          Date.parse(getUtcBoundariesForLocalDate(date, zone).end);
        // Labelled so a failure names the zone and date that broke.
        expect(`${zone} ${date}: ${gap}ms`).toBe(`${zone} ${date}: 1ms`);
      }
    }
  });

  it("spans a whole day, to the millisecond", () => {
    for (const zone of ZONES) {
      const { start, end } = getUtcBoundariesForLocalDate("2026-07-31", zone);
      expect(Date.parse(end) - Date.parse(start)).toBe(86_400_000 - 1);
    }
  });

  it("starts before it ends, in every zone", () => {
    for (const zone of ZONES) {
      const { start, end } = getUtcBoundariesForLocalDate("2026-07-31", zone);
      expect(Date.parse(start)).toBeLessThan(Date.parse(end));
    }
  });

  it("handles a quarter-hour offset without drifting", () => {
    const { start } = getUtcBoundariesForLocalDate("2026-07-31", "Asia/Kathmandu");
    expect(start).toBe("2026-07-30T18:15:00.000Z");
  });

  it("shifts with DST rather than assuming a fixed offset", () => {
    // New York is UTC-5 in January and UTC-4 in July.
    expect(getUtcBoundariesForLocalDate("2026-01-15", "America/New_York").start).toBe(
      "2026-01-15T05:00:00.000Z",
    );
    expect(getUtcBoundariesForLocalDate("2026-07-15", "America/New_York").start).toBe(
      "2026-07-15T04:00:00.000Z",
    );
  });

  it("falls back to a naive UTC day for an unknown zone rather than throwing", () => {
    const { start, end } = getUtcBoundariesForLocalDate("2026-07-31", "Not/AZone");
    expect(start).toBe("2026-07-31T00:00:00.000Z");
    expect(end).toBe("2026-07-31T23:59:59.999Z");
  });
});
