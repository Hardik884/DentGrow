/**
 * The escalation safeguard on problem dismissals.
 *
 * A snooze that only expires by date is unsafe in a way that is easy to miss:
 * "3 patients owe money", hidden for a month, would keep hiding the card when it
 * becomes 40 patients owing ten times as much — and the clinic would never learn
 * that the thing they judged unimportant stopped being unimportant. So a
 * dismissal is bound to the severity it was made against.
 *
 * `isSuppressed` is pure, so the rule is pinned here without a database.
 */

import { describe, expect, it } from "vitest";

import { isSuppressed, type ActiveDismissal } from "../dismissals";
import type { Severity } from "@/business-brain";

const at = (severity: string): ActiveDismissal => ({
  category: "revenue_leakage",
  severityAtDismissal: severity,
  reason: "these patients are on an agreed payment plan",
  expiresAt: "2026-12-01T00:00:00.000Z",
});

describe("isSuppressed", () => {
  it("hides a problem that is no worse than when it was dismissed", () => {
    expect(isSuppressed(at("medium"), "medium" as Severity)).toBe(true);
    expect(isSuppressed(at("medium"), "low" as Severity)).toBe(true);
    expect(isSuppressed(at("critical"), "high" as Severity)).toBe(true);
  });

  it("brings the card back the moment the problem escalates a band", () => {
    // The whole point of storing the severity. A date-only snooze would return
    // true for all three of these.
    expect(isSuppressed(at("medium"), "high" as Severity)).toBe(false);
    expect(isSuppressed(at("low"), "critical" as Severity)).toBe(false);
    expect(isSuppressed(at("high"), "critical" as Severity)).toBe(false);
  });

  it("shows everything when there is no dismissal", () => {
    expect(isSuppressed(undefined, "critical" as Severity)).toBe(false);
    expect(isSuppressed(undefined, "info" as Severity)).toBe(false);
  });

  it("fails OPEN on a severity it does not recognise", () => {
    // An unknown value means we cannot PROVE the problem has not escalated.
    // Showing a card that was snoozed is a far cheaper mistake than hiding one
    // that has got worse, so the ambiguous case shows.
    expect(isSuppressed(at("catastrophic"), "high" as Severity)).toBe(false);
    expect(isSuppressed(at("high"), "unheard-of" as Severity)).toBe(false);
  });
});
