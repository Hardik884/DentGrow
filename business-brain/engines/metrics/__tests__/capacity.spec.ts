/**
 * Specs for time-based capacity.
 *
 * The behaviours worth guarding are the ones the old slot-counting version got
 * wrong: appointments of different lengths must consume different amounts of the
 * chair, and a multi-chair clinic must not read as saturated on an ordinary day.
 * Both errors ran in the same direction — they made a busy clinic look idle —
 * and both were invisible in a fixture where every appointment happened to be
 * exactly one slot long.
 */

import { describe, expect, it } from "vitest";

import {
  appointmentCapacityToday,
  availableSlotsToday,
  chairUtilization,
  openMinutesToday,
} from "../calculators/capacity-metrics";
import { appointment, snapshot, valueOf } from "./fixtures/snapshot-fixtures";

/** An 8-hour single-chair day at a 30-minute typical appointment. */
function capacity(over: Partial<{ open: number; chairs: number; typical: number }> = {}) {
  return {
    openMinutesToday: over.open ?? 480,
    chairCount: over.chairs ?? 1,
    typicalAppointmentMinutes: over.typical ?? 30,
  };
}

describe("chairUtilization", () => {
  it("expresses booked chair-time as a percentage of open chair-time", () => {
    const s = snapshot({
      capacity: capacity(),
      appointmentsToday: Array.from({ length: 8 }, () => appointment({ durationMinutes: 30 })),
    });
    // 240 of 480 minutes.
    expect(valueOf(chairUtilization, s)).toBe(50);
  });

  it("counts a long appointment as more chair time than a short one", () => {
    // The defect that motivated all of this: as a slot count these two days are
    // identical at four appointments each, and they are four hours apart.
    const short = snapshot({
      capacity: capacity(),
      appointmentsToday: Array.from({ length: 4 }, () => appointment({ durationMinutes: 15 })),
    });
    const long = snapshot({
      capacity: capacity(),
      appointmentsToday: Array.from({ length: 4 }, () => appointment({ durationMinutes: 60 })),
    });
    expect(valueOf(chairUtilization, short)).toBe(12.5);
    expect(valueOf(chairUtilization, long)).toBe(50);
  });

  it("frees the chair for cancellations and no-shows", () => {
    const s = snapshot({
      capacity: capacity(),
      appointmentsToday: [
        appointment({ status: "completed", durationMinutes: 60 }),
        appointment({ status: "cancelled", durationMinutes: 60 }),
        appointment({ status: "no_show", durationMinutes: 60 }),
      ],
    });
    expect(valueOf(chairUtilization, s)).toBe(12.5);
  });

  it("divides three chairs' work across three chairs, not one", () => {
    // Three chairs delivering 8 hours each. As a single-chair clinic this is
    // 300% booked, which the cap flattens to a permanent 100% — a normal day
    // made indistinguishable from a genuinely overloaded one.
    const appointments = Array.from({ length: 48 }, () => appointment({ durationMinutes: 30 }));
    const oneChair = snapshot({ capacity: capacity(), appointmentsToday: appointments });
    const threeChairs = snapshot({
      capacity: capacity({ chairs: 3 }),
      appointmentsToday: appointments,
    });
    expect(valueOf(chairUtilization, oneChair)).toBe(100);
    expect(valueOf(chairUtilization, threeChairs)).toBe(100);

    const halfFull = snapshot({
      capacity: capacity({ chairs: 3 }),
      appointmentsToday: appointments.slice(0, 24),
    });
    expect(valueOf(chairUtilization, halfFull)).toBe(50);
  });

  it("is WITHHELD (null) on a closed day rather than a misleading 0%", () => {
    // No open minutes = no capacity to measure. Reporting "0% used" would imply
    // unused available capacity on a day there was none, and cost the health
    // score points for being shut.
    const s = snapshot({
      capacity: capacity({ open: 0 }),
      appointmentsToday: [appointment()],
    });
    expect(chairUtilization(s)).toBeNull();
  });

  it("reports a real 0% on an OPEN day that booked nothing", () => {
    // Open but empty is genuine unused capacity — reported, not withheld.
    const s = snapshot({
      capacity: capacity({ open: 480 }),
      appointmentsToday: [],
    });
    expect(valueOf(chairUtilization, s)).toBe(0);
  });

  it("treats a chair count of zero as one rather than as no capacity", () => {
    // Defence in depth behind the database CHECK: a 0 would divide by zero and
    // report a working clinic at 0% utilization.
    const s = snapshot({
      capacity: capacity({ chairs: 0 }),
      appointmentsToday: [appointment({ durationMinutes: 240 })],
    });
    expect(valueOf(chairUtilization, s)).toBe(50);
  });

  it("substitutes the default length for an appointment with no duration", () => {
    // Zero would erase a real booking from the numerator and report the chair
    // as free while a patient is in it.
    const s = snapshot({
      capacity: capacity(),
      appointmentsToday: [appointment({ durationMinutes: 0 })],
    });
    expect(valueOf(chairUtilization, s)).toBe(6.3);
  });

  it("caps at 100% when the clinic is overbooked", () => {
    const s = snapshot({
      capacity: capacity({ open: 60 }),
      appointmentsToday: Array.from({ length: 4 }, () => appointment({ durationMinutes: 60 })),
    });
    expect(valueOf(chairUtilization, s)).toBe(100);
  });

  it("rounds to one decimal place", () => {
    const s = snapshot({
      capacity: capacity({ open: 90 }),
      appointmentsToday: [appointment({ durationMinutes: 30 })],
    });
    // 30/90 = 33.333… -> 33.3
    expect(valueOf(chairUtilization, s)).toBe(33.3);
  });
});

describe("availableSlotsToday", () => {
  it("reports the spare time as whole typical appointments", () => {
    const s = snapshot({
      capacity: capacity(),
      appointmentsToday: Array.from({ length: 3 }, () => appointment({ durationMinutes: 60 })),
    });
    // 480 - 180 = 300 free minutes, 10 appointments of 30.
    expect(valueOf(availableSlotsToday, s)).toBe(10);
  });

  it("rounds DOWN, never claiming room that does not exist", () => {
    // 50 free minutes is one 30-minute appointment, not two, and not 1.7.
    const s = snapshot({
      capacity: capacity({ open: 100 }),
      appointmentsToday: [appointment({ durationMinutes: 50 })],
    });
    expect(valueOf(availableSlotsToday, s)).toBe(1);
  });

  it("uses the clinic's own typical length, not a fixed 30 minutes", () => {
    const s = snapshot({
      capacity: capacity({ typical: 60 }),
      appointmentsToday: [],
    });
    expect(valueOf(availableSlotsToday, s)).toBe(8);
  });

  it("gives the chair back after a cancellation", () => {
    const s = snapshot({
      capacity: capacity({ open: 120 }),
      appointmentsToday: [
        appointment({ status: "cancelled", durationMinutes: 60 }),
        appointment({ status: "no_show", durationMinutes: 60 }),
      ],
    });
    expect(valueOf(availableSlotsToday, s)).toBe(4);
  });

  it("floors at zero when overbooked", () => {
    const s = snapshot({
      capacity: capacity({ open: 30 }),
      appointmentsToday: Array.from({ length: 3 }, () => appointment({ durationMinutes: 60 })),
    });
    expect(valueOf(availableSlotsToday, s)).toBe(0);
  });

  it("reports no room on a closed day", () => {
    expect(valueOf(availableSlotsToday, snapshot({ capacity: capacity({ open: 0 }) }))).toBe(0);
  });

  it("stays consistent with utilization: a full day leaves no room", () => {
    const s = snapshot({
      capacity: capacity({ open: 120 }),
      appointmentsToday: Array.from({ length: 2 }, () => appointment({ durationMinutes: 60 })),
    });
    expect(valueOf(chairUtilization, s)).toBe(100);
    expect(valueOf(availableSlotsToday, s)).toBe(0);
  });
});

describe("openMinutesToday and appointmentCapacityToday", () => {
  it("publishes open time as chair-minutes, so the percentage can be checked", () => {
    const s = snapshot({ capacity: capacity({ chairs: 2 }) });
    expect(valueOf(openMinutesToday, s)).toBe(960);
  });

  it("reports the same capacity in whole appointments", () => {
    const s = snapshot({ capacity: capacity({ chairs: 2 }) });
    expect(valueOf(appointmentCapacityToday, s)).toBe(32);
  });

  it("reports zero of both on a closed day", () => {
    const s = snapshot({ capacity: capacity({ open: 0 }) });
    expect(valueOf(openMinutesToday, s)).toBe(0);
    expect(valueOf(appointmentCapacityToday, s)).toBe(0);
  });

  it("keeps capacity, booked and available in agreement", () => {
    const s = snapshot({
      capacity: capacity(),
      appointmentsToday: Array.from({ length: 5 }, () => appointment({ durationMinutes: 30 })),
    });
    const total = valueOf(appointmentCapacityToday, s);
    const free = valueOf(availableSlotsToday, s);
    expect(total).toBe(16);
    expect(free).toBe(11);
    expect(total - free).toBe(5);
  });
});
