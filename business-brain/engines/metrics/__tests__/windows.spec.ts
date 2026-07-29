/**
 * Specs for the trailing-window metrics: production, collection rate, average
 * case value, and reactivation candidates.
 *
 * DATE is 2026-07-28, so a 30-day inclusive window runs 2026-06-29 .. 2026-07-28
 * and the 180-day reactivation cutoff is 2026-01-29.
 */

import { describe, expect, it } from "vitest";

import { collectionRate30d, production30d } from "../calculators/revenue-metrics";
import { averageCaseValue30d } from "../calculators/treatment-metrics";
import { reactivationCandidates } from "../calculators/patient-metrics";
import { windowStart } from "../support/windows";
import {
  DATE,
  isWithheld,
  payment,
  rosterEntry,
  snapshot,
  treatment,
  valueOf,
} from "./fixtures/snapshot-fixtures";

const IN_WINDOW = "2026-07-10T10:00:00.000Z";
const WINDOW_FIRST_DAY = "2026-06-29T10:00:00.000Z";
const JUST_OUTSIDE = "2026-06-28T10:00:00.000Z";

describe("windowStart", () => {
  it("is inclusive — a 30-day window ending 2026-07-28 starts 2026-06-29", () => {
    expect(windowStart(DATE, 30)).toBe("2026-06-29");
  });

  it("crosses month and year boundaries correctly", () => {
    expect(windowStart("2026-01-05", 30)).toBe("2025-12-07");
  });
});

describe("production30d", () => {
  it("sums gross cost of treatments completed inside the window", () => {
    const s = snapshot({
      treatments: [
        treatment({ cost: 5000, status: "completed", performedAt: IN_WINDOW }),
        treatment({ cost: 3000, status: "completed", performedAt: WINDOW_FIRST_DAY }),
      ],
    });
    expect(valueOf(production30d, s)).toBe(8000);
  });

  it("excludes work completed the day before the window opens", () => {
    const s = snapshot({
      treatments: [treatment({ cost: 9999, status: "completed", performedAt: JUST_OUTSIDE })],
    });
    expect(valueOf(production30d, s)).toBe(0);
  });

  it("counts only completed work — planned and in_progress are not delivered", () => {
    const s = snapshot({
      treatments: [
        treatment({ cost: 1000, status: "completed", performedAt: IN_WINDOW }),
        treatment({ cost: 9999, status: "planned", performedAt: IN_WINDOW }),
        treatment({ cost: 9999, status: "in_progress", performedAt: IN_WINDOW }),
        treatment({ cost: 9999, status: "cancelled", performedAt: IN_WINDOW }),
      ],
    });
    expect(valueOf(production30d, s)).toBe(1000);
  });

  it("uses gross cost, not the clinic's retained share", () => {
    const s = snapshot({
      treatments: [
        treatment({ cost: 5000, status: "completed", performedAt: IN_WINDOW }),
      ],
    });
    expect(valueOf(production30d, s)).toBe(5000);
  });

  it("reports zero, not withheld, when nothing was delivered", () => {
    expect(valueOf(production30d, snapshot())).toBe(0);
  });
});

describe("collectionRate30d", () => {
  it("expresses cash received as a percentage of work delivered", () => {
    const s = snapshot({
      treatments: [treatment({ cost: 10000, status: "completed", performedAt: IN_WINDOW })],
      payments: [payment({ amount: 7500, paymentDate: "2026-07-15" })],
    });
    expect(valueOf(collectionRate30d, s)).toBe(75);
  });

  it("counts only payments inside the window", () => {
    const s = snapshot({
      treatments: [treatment({ cost: 10000, status: "completed", performedAt: IN_WINDOW })],
      payments: [
        payment({ amount: 5000, paymentDate: "2026-07-15" }),
        payment({ amount: 9999, paymentDate: "2026-06-28" }), // just outside
      ],
    });
    expect(valueOf(collectionRate30d, s)).toBe(50);
  });

  it("can exceed 100% when historic dues are collected", () => {
    // Deliberately uncapped: clearing an old balance is real and must be visible.
    const s = snapshot({
      treatments: [treatment({ cost: 1000, status: "completed", performedAt: IN_WINDOW })],
      payments: [payment({ amount: 2500, paymentDate: "2026-07-15" })],
    });
    expect(valueOf(collectionRate30d, s)).toBe(250);
  });

  it("WITHHOLDS when nothing was produced — a ratio against zero is undefined", () => {
    const s = snapshot({ payments: [payment({ amount: 5000, paymentDate: "2026-07-15" })] });
    expect(isWithheld(collectionRate30d, s)).toBe(true);
  });

  it("reports 0% when work was delivered and nothing collected", () => {
    // Distinct from the withheld case: this is a real, and alarming, measurement.
    const s = snapshot({
      treatments: [treatment({ cost: 10000, status: "completed", performedAt: IN_WINDOW })],
      payments: [],
    });
    expect(valueOf(collectionRate30d, s)).toBe(0);
  });

  it("rounds to one decimal place", () => {
    const s = snapshot({
      treatments: [treatment({ cost: 3000, status: "completed", performedAt: IN_WINDOW })],
      payments: [payment({ amount: 1000, paymentDate: "2026-07-15" })],
    });
    expect(valueOf(collectionRate30d, s)).toBe(33.3);
  });
});

describe("averageCaseValue30d", () => {
  it("averages gross cost across cases completed in the window", () => {
    const s = snapshot({
      treatments: [
        treatment({ cost: 1000, status: "completed", performedAt: IN_WINDOW }),
        treatment({ cost: 5000, status: "completed", performedAt: IN_WINDOW }),
      ],
    });
    expect(valueOf(averageCaseValue30d, s)).toBe(3000);
  });

  it("WITHHOLDS when no case completed — a mean of nothing is undefined", () => {
    expect(isWithheld(averageCaseValue30d, snapshot())).toBe(true);
  });

  it("divides by the same case set production sums, so the two agree", () => {
    const s = snapshot({
      treatments: [
        treatment({ cost: 2000, status: "completed", performedAt: IN_WINDOW }),
        treatment({ cost: 4000, status: "completed", performedAt: IN_WINDOW }),
        treatment({ cost: 9999, status: "planned", performedAt: IN_WINDOW }),
      ],
    });
    expect(valueOf(production30d, s)).toBe(6000);
    expect(valueOf(averageCaseValue30d, s)).toBe(3000);
  });
});

describe("reactivationCandidates", () => {
  it("counts lapsed patients with no upcoming visit", () => {
    const s = snapshot({
      patientRoster: [
        rosterEntry({ lastVisit: "2025-06-01T10:00:00.000Z", hasUpcomingAppointment: false }),
        rosterEntry({ lastVisit: "2025-12-01T10:00:00.000Z", hasUpcomingAppointment: false }),
      ],
    });
    expect(valueOf(reactivationCandidates, s)).toBe(2);
  });

  it("excludes a lapsed patient who already has a visit booked", () => {
    const s = snapshot({
      patientRoster: [
        rosterEntry({ lastVisit: "2025-06-01T10:00:00.000Z", hasUpcomingAppointment: true }),
      ],
    });
    expect(valueOf(reactivationCandidates, s)).toBe(0);
  });

  it("excludes a patient seen inside the recall interval", () => {
    // Cutoff is 2026-01-29; this visit is comfortably after it.
    const s = snapshot({
      patientRoster: [
        rosterEntry({ lastVisit: "2026-06-01T10:00:00.000Z", hasUpcomingAppointment: false }),
      ],
    });
    expect(valueOf(reactivationCandidates, s)).toBe(0);
  });

  it("excludes a patient who has never attended — that is acquisition, not lapse", () => {
    const s = snapshot({
      patientRoster: [rosterEntry({ lastVisit: null, hasUpcomingAppointment: false })],
    });
    expect(valueOf(reactivationCandidates, s)).toBe(0);
  });

  it("WITHHOLDS when the snapshot carries no roster", () => {
    // Different from "nobody to reactivate": the data was never supplied.
    expect(isWithheld(reactivationCandidates, snapshot())).toBe(true);
  });

  it("reports zero for a roster with nobody lapsed", () => {
    const s = snapshot({ patientRoster: [] });
    expect(valueOf(reactivationCandidates, s)).toBe(0);
  });
});

