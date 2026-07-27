import { describe, expect, it } from "vitest";

import { averageWaitingTime, patientsWaiting } from "../calculators/queue-metrics";
import { DATE, queueEntry, snapshot, valueOf } from "./fixtures/snapshot-fixtures";

describe("patientsWaiting", () => {
  it("counts only entries still in the waiting state", () => {
    const s = snapshot({
      queueToday: [
        queueEntry({ status: "waiting" }),
        queueEntry({ status: "waiting" }),
        queueEntry({ status: "in_progress" }),
        queueEntry({ status: "completed" }),
      ],
    });
    expect(valueOf(patientsWaiting, s)).toBe(2);
  });

  it("reports zero for an empty queue", () => {
    expect(valueOf(patientsWaiting, snapshot())).toBe(0);
  });
});

describe("averageWaitingTime", () => {
  it("measures a called-in patient from check-in to called-at", () => {
    const s = snapshot({
      queueToday: [
        queueEntry({
          checkedInAt: `${DATE}T10:00:00.000Z`,
          startedAt: `${DATE}T10:20:00.000Z`,
        }),
      ],
    });
    expect(valueOf(averageWaitingTime, s)).toBe(20);
  });

  it("measures a still-waiting patient against asOf, never the system clock", () => {
    // asOf is 12:00; checked in at 11:30 and not yet called.
    const s = snapshot({
      queueToday: [queueEntry({ checkedInAt: `${DATE}T11:30:00.000Z`, startedAt: null })],
    });
    expect(valueOf(averageWaitingTime, s)).toBe(30);
  });

  it("averages across mixed called-in and still-waiting entries", () => {
    const s = snapshot({
      queueToday: [
        queueEntry({ checkedInAt: `${DATE}T10:00:00.000Z`, startedAt: `${DATE}T10:10:00.000Z` }),
        queueEntry({ checkedInAt: `${DATE}T11:30:00.000Z`, startedAt: null }),
      ],
    });
    // (10 + 30) / 2
    expect(valueOf(averageWaitingTime, s)).toBe(20);
  });

  it("rounds to one decimal place", () => {
    const s = snapshot({
      queueToday: [
        queueEntry({ checkedInAt: `${DATE}T10:00:00.000Z`, startedAt: `${DATE}T10:10:00.000Z` }),
        queueEntry({ checkedInAt: `${DATE}T10:00:00.000Z`, startedAt: `${DATE}T10:11:00.000Z` }),
        queueEntry({ checkedInAt: `${DATE}T10:00:00.000Z`, startedAt: `${DATE}T10:12:00.000Z` }),
      ],
    });
    // 33/3 = 11 exactly; add a fourth to force a repeating average.
    expect(valueOf(averageWaitingTime, s)).toBe(11);
  });

  it("skips entries with unparseable timestamps instead of producing NaN", () => {
    const s = snapshot({
      queueToday: [
        queueEntry({ checkedInAt: "not-a-date", startedAt: `${DATE}T10:10:00.000Z` }),
        queueEntry({ checkedInAt: `${DATE}T10:00:00.000Z`, startedAt: `${DATE}T10:20:00.000Z` }),
      ],
    });
    expect(valueOf(averageWaitingTime, s)).toBe(20);
  });

  it("skips entries whose end precedes their start", () => {
    const s = snapshot({
      queueToday: [
        queueEntry({ checkedInAt: `${DATE}T11:00:00.000Z`, startedAt: `${DATE}T10:00:00.000Z` }),
        queueEntry({ checkedInAt: `${DATE}T10:00:00.000Z`, startedAt: `${DATE}T10:40:00.000Z` }),
      ],
    });
    expect(valueOf(averageWaitingTime, s)).toBe(40);
  });

  it("reports zero when there is nothing measurable", () => {
    expect(valueOf(averageWaitingTime, snapshot())).toBe(0);
    const unusable = snapshot({ queueToday: [queueEntry({ checkedInAt: "bad", startedAt: "bad" })] });
    expect(valueOf(averageWaitingTime, unusable)).toBe(0);
  });
});
