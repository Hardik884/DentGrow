import { describe, expect, it } from "vitest";

import {
  cancelledAppointmentsToday,
  noShowsToday,
  totalAppointmentsToday,
} from "../calculators/appointment-metrics";
import { appointment, snapshot, valueOf } from "./fixtures/snapshot-fixtures";

/** One appointment in each lifecycle state. */
const allStatuses = [
  appointment({ status: "scheduled" }),
  appointment({ status: "checked_in" }),
  appointment({ status: "in_progress" }),
  appointment({ status: "completed" }),
  appointment({ status: "cancelled" }),
  appointment({ status: "no_show" }),
];

describe("appointment metrics", () => {
  it("counts every appointment on the day, including cancelled and no-show", () => {
    expect(valueOf(totalAppointmentsToday, snapshot({ appointmentsToday: allStatuses }))).toBe(6);
  });

  it("counts cancellations and no-shows separately", () => {
    const s = snapshot({ appointmentsToday: allStatuses });
    expect(valueOf(cancelledAppointmentsToday, s)).toBe(1);
    expect(valueOf(noShowsToday, s)).toBe(1);
  });

  it("reports zero for every appointment metric on an empty day", () => {
    const s = snapshot();
    expect(valueOf(totalAppointmentsToday, s)).toBe(0);
    expect(valueOf(cancelledAppointmentsToday, s)).toBe(0);
    expect(valueOf(noShowsToday, s)).toBe(0);
  });

  it("ignores unknown statuses rather than throwing", () => {
    const s = snapshot({ appointmentsToday: [appointment({ status: "rescheduled_future" })] });
    expect(valueOf(totalAppointmentsToday, s)).toBe(1);
    expect(valueOf(cancelledAppointmentsToday, s)).toBe(0);
  });
});
