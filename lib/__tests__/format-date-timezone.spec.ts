/**
 * Regression: displayed dates (e.g. a printed prescription) must show the
 * clinic-local calendar day, not the viewer's/UTC day, for a timestamp near
 * midnight (audit A17 display).
 */

import { describe, expect, it } from "vitest";

import { formatDateInTimezone } from "@/lib/utils";

describe("formatDateInTimezone", () => {
  it("shows the clinic-local date for a timestamp past UTC midnight (Asia/Kolkata)", () => {
    // 2026-08-12 20:00 UTC == 2026-08-13 01:30 IST → the clinic's day is Aug 13.
    expect(formatDateInTimezone("2026-08-12T20:00:00Z", "Asia/Kolkata")).toBe("13 Aug 2026");
  });

  it("shows the previous day for a west-of-UTC clinic near midnight", () => {
    // 2026-08-13 04:00 UTC == 2026-08-12 21:00 PDT → the clinic's day is Aug 12.
    expect(formatDateInTimezone("2026-08-13T04:00:00Z", "America/Los_Angeles")).toBe("12 Aug 2026");
  });

  it("returns an em dash for a null date", () => {
    expect(formatDateInTimezone(null, "Asia/Kolkata")).toBe("—");
  });
});
