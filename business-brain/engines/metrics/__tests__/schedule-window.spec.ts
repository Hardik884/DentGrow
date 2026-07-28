/**
 * Specs for the schedule-window metrics: cancellation and no-show rates,
 * booking lead time, 30-day utilization, and forward schedule health.
 *
 * DATE is 2026-07-28. The trailing window is 2026-06-29..2026-07-28 and the
 * forward window is 2026-07-29..2026-08-04.
 */

import { describe, expect, it } from "vitest";

import { bookedNext7d, chairUtilization30d } from "../calculators/capacity-metrics";
import {
  bookingLeadTimeDays,
  cancellationRate30d,
  noShowRate30d,
} from "../calculators/scheduling-metrics";
import { appointment, isWithheld, scheduleWindow, snapshot, valueOf } from "./fixtures/snapshot-fixtures";

/** Four appointments: 2 completed, 1 cancelled, 1 no-show. */
const mixed = [
  appointment({ status: "completed" }),
  appointment({ status: "completed" }),
  appointment({ status: "cancelled" }),
  appointment({ status: "no_show" }),
];

describe("cancellationRate30d / noShowRate30d", () => {
  it("expresses attrition as a share of all appointments in the window", () => {
    const s = snapshot({ trailingWindow: scheduleWindow({ appointments: mixed }) });
    expect(valueOf(cancellationRate30d, s)).toBe(25);
    expect(valueOf(noShowRate30d, s)).toBe(25);
  });

  it("WITHHOLDS when the window is absent", () => {
    expect(isWithheld(cancellationRate30d, snapshot())).toBe(true);
    expect(isWithheld(noShowRate30d, snapshot())).toBe(true);
  });

  it("WITHHOLDS when the window has no appointments — no denominator", () => {
    const s = snapshot({ trailingWindow: scheduleWindow({ appointments: [] }) });
    expect(isWithheld(cancellationRate30d, s)).toBe(true);
  });

  it("reports 0% for a clean window rather than withholding", () => {
    const s = snapshot({
      trailingWindow: scheduleWindow({ appointments: [appointment({ status: "completed" })] }),
    });
    expect(valueOf(cancellationRate30d, s)).toBe(0);
  });
});

describe("bookingLeadTimeDays", () => {
  it("reports the median days between booking and appointment", () => {
    const s = snapshot({
      trailingWindow: scheduleWindow({
        appointments: [
          appointment({ createdAt: "2026-07-01T10:00:00.000Z", scheduledAt: "2026-07-03T10:00:00.000Z" }), // 2
          appointment({ createdAt: "2026-07-01T10:00:00.000Z", scheduledAt: "2026-07-11T10:00:00.000Z" }), // 10
          appointment({ createdAt: "2026-07-01T10:00:00.000Z", scheduledAt: "2026-07-21T10:00:00.000Z" }), // 20
        ],
      }),
    });
    expect(valueOf(bookingLeadTimeDays, s)).toBe(10);
  });

  it("uses the median so one distant booking cannot distort it", () => {
    const s = snapshot({
      trailingWindow: scheduleWindow({
        appointments: [
          appointment({ createdAt: "2026-07-01T00:00:00.000Z", scheduledAt: "2026-07-02T00:00:00.000Z" }),
          appointment({ createdAt: "2026-07-01T00:00:00.000Z", scheduledAt: "2026-07-03T00:00:00.000Z" }),
          appointment({ createdAt: "2026-07-01T00:00:00.000Z", scheduledAt: "2027-07-01T00:00:00.000Z" }),
        ],
      }),
    });
    // Mean would be ~123 days; the median is the honest figure.
    expect(valueOf(bookingLeadTimeDays, s)).toBe(2);
  });

  it("excludes backdated entries — a record created after the visit is not a booking", () => {
    const s = snapshot({
      trailingWindow: scheduleWindow({
        appointments: [
          appointment({ createdAt: "2026-07-20T00:00:00.000Z", scheduledAt: "2026-07-01T00:00:00.000Z" }), // negative
          appointment({ createdAt: "2026-07-01T00:00:00.000Z", scheduledAt: "2026-07-06T00:00:00.000Z" }), // 5
        ],
      }),
    });
    expect(valueOf(bookingLeadTimeDays, s)).toBe(5);
  });

  it("counts a same-day walk-in as zero lead time, not as missing", () => {
    const s = snapshot({
      trailingWindow: scheduleWindow({
        appointments: [
          appointment({ createdAt: "2026-07-10T09:00:00.000Z", scheduledAt: "2026-07-10T09:00:00.000Z" }),
        ],
      }),
    });
    expect(valueOf(bookingLeadTimeDays, s)).toBe(0);
  });

  it("WITHHOLDS when every appointment is backdated", () => {
    const s = snapshot({
      trailingWindow: scheduleWindow({
        appointments: [
          appointment({ createdAt: "2026-07-20T00:00:00.000Z", scheduledAt: "2026-07-01T00:00:00.000Z" }),
        ],
      }),
    });
    expect(isWithheld(bookingLeadTimeDays, s)).toBe(true);
  });
});

describe("chairUtilization30d", () => {
  it("averages booked against offered slots across the window", () => {
    const s = snapshot({
      trailingWindow: scheduleWindow({ appointments: mixed, totalSlots: 8 }),
    });
    // 2 of 4 still occupy a slot (cancelled and no-show free it): 2/8.
    expect(valueOf(chairUtilization30d, s)).toBe(25);
  });

  it("WITHHOLDS when the clinic offered no capacity across the window", () => {
    const s = snapshot({ trailingWindow: scheduleWindow({ appointments: mixed, totalSlots: 0 }) });
    expect(isWithheld(chairUtilization30d, s)).toBe(true);
  });

  it("WITHHOLDS when the window is absent", () => {
    expect(isWithheld(chairUtilization30d, snapshot())).toBe(true);
  });
});

describe("bookedNext7d", () => {
  it("reports how full the days ahead are", () => {
    const s = snapshot({
      forwardWindow: scheduleWindow({
        from: "2026-07-29",
        to: "2026-08-04",
        appointments: [appointment(), appointment(), appointment()],
        totalSlots: 20,
      }),
    });
    expect(valueOf(bookedNext7d, s)).toBe(15);
  });

  it("frees the slot for a cancelled future appointment", () => {
    const s = snapshot({
      forwardWindow: scheduleWindow({
        appointments: [appointment({ status: "cancelled" }), appointment({ status: "scheduled" })],
        totalSlots: 10,
      }),
    });
    expect(valueOf(bookedNext7d, s)).toBe(10);
  });

  it("WITHHOLDS for a closed week — not open is not the same as not booked", () => {
    const s = snapshot({ forwardWindow: scheduleWindow({ appointments: [], totalSlots: 0 }) });
    expect(isWithheld(bookedNext7d, s)).toBe(true);
  });

  it("reports 0% for an open but empty week — that is the warning it exists for", () => {
    const s = snapshot({ forwardWindow: scheduleWindow({ appointments: [], totalSlots: 20 }) });
    expect(valueOf(bookedNext7d, s)).toBe(0);
  });

  it("reads the forward window, never the trailing one", () => {
    const s = snapshot({
      trailingWindow: scheduleWindow({ appointments: mixed, totalSlots: 4 }),
      forwardWindow: scheduleWindow({ appointments: [], totalSlots: 20 }),
    });
    expect(valueOf(bookedNext7d, s)).toBe(0);
    expect(valueOf(chairUtilization30d, s)).toBe(50);
  });
});
