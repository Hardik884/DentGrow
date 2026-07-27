import { describe, expect, it } from "vitest";

import { availableSlotsToday, chairUtilization } from "../calculators/capacity-metrics";
import { appointment, snapshot, valueOf } from "./fixtures/snapshot-fixtures";

describe("chairUtilization", () => {
  it("expresses occupied slots as a percentage of slots offered", () => {
    const s = snapshot({
      capacity: { totalSlotsToday: 10 },
      appointmentsToday: [appointment(), appointment(), appointment(), appointment()],
    });
    expect(valueOf(chairUtilization, s)).toBe(40);
  });

  it("frees the slot for cancellations and no-shows", () => {
    const s = snapshot({
      capacity: { totalSlotsToday: 10 },
      appointmentsToday: [
        appointment({ status: "completed" }),
        appointment({ status: "cancelled" }),
        appointment({ status: "no_show" }),
      ],
    });
    expect(valueOf(chairUtilization, s)).toBe(10);
  });

  it("returns 0 rather than dividing by zero on a closed day", () => {
    const s = snapshot({ capacity: { totalSlotsToday: 0 }, appointmentsToday: [appointment()] });
    expect(valueOf(chairUtilization, s)).toBe(0);
  });

  it("caps at 100% when the clinic is overbooked", () => {
    const s = snapshot({
      capacity: { totalSlotsToday: 2 },
      appointmentsToday: [appointment(), appointment(), appointment(), appointment()],
    });
    expect(valueOf(chairUtilization, s)).toBe(100);
  });

  it("rounds to one decimal place", () => {
    const s = snapshot({
      capacity: { totalSlotsToday: 3 },
      appointmentsToday: [appointment()],
    });
    // 1/3 = 33.333… -> 33.3
    expect(valueOf(chairUtilization, s)).toBe(33.3);
  });
});

describe("availableSlotsToday", () => {
  it("subtracts occupied slots from the slots offered", () => {
    const s = snapshot({
      capacity: { totalSlotsToday: 8 },
      appointmentsToday: [appointment(), appointment(), appointment()],
    });
    expect(valueOf(availableSlotsToday, s)).toBe(5);
  });

  it("counts a cancelled slot as available again", () => {
    const s = snapshot({
      capacity: { totalSlotsToday: 4 },
      appointmentsToday: [appointment({ status: "cancelled" }), appointment({ status: "no_show" })],
    });
    expect(valueOf(availableSlotsToday, s)).toBe(4);
  });

  it("floors at zero when overbooked", () => {
    const s = snapshot({
      capacity: { totalSlotsToday: 1 },
      appointmentsToday: [appointment(), appointment(), appointment()],
    });
    expect(valueOf(availableSlotsToday, s)).toBe(0);
  });

  it("reports zero slots on a closed day", () => {
    expect(valueOf(availableSlotsToday, snapshot())).toBe(0);
  });

  it("stays consistent with utilization: full capacity means no slots left", () => {
    const s = snapshot({
      capacity: { totalSlotsToday: 3 },
      appointmentsToday: [appointment(), appointment(), appointment()],
    });
    expect(valueOf(chairUtilization, s)).toBe(100);
    expect(valueOf(availableSlotsToday, s)).toBe(0);
  });
});
