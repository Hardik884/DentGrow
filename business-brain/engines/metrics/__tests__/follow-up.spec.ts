import { describe, expect, it } from "vitest";

import { followUpsDueToday, overdueFollowUps } from "../calculators/follow-up-metrics";
import { followUp, snapshot, valueOf } from "./fixtures/snapshot-fixtures";

describe("followUpsDueToday", () => {
  it("counts pending follow-ups due exactly today", () => {
    const s = snapshot({
      followUps: [
        followUp({ dueDate: "2026-07-28" }),
        followUp({ dueDate: "2026-07-28" }),
        followUp({ dueDate: "2026-07-29" }),
        followUp({ dueDate: "2026-07-27" }),
      ],
    });
    expect(valueOf(followUpsDueToday, s)).toBe(2);
  });

  it("ignores completed and cancelled follow-ups due today", () => {
    const s = snapshot({
      followUps: [
        followUp({ status: "pending" }),
        followUp({ status: "completed" }),
        followUp({ status: "cancelled" }),
      ],
    });
    expect(valueOf(followUpsDueToday, s)).toBe(1);
  });
});

describe("overdueFollowUps", () => {
  it("counts pending follow-ups whose due date has passed", () => {
    const s = snapshot({
      followUps: [
        followUp({ dueDate: "2026-07-27" }),
        followUp({ dueDate: "2026-06-01" }),
        followUp({ dueDate: "2026-07-28" }),
        followUp({ dueDate: "2026-08-01" }),
      ],
    });
    expect(valueOf(overdueFollowUps, s)).toBe(2);
  });

  it("does not count a follow-up due today as overdue", () => {
    const s = snapshot({ followUps: [followUp({ dueDate: "2026-07-28" })] });
    expect(valueOf(overdueFollowUps, s)).toBe(0);
    expect(valueOf(followUpsDueToday, s)).toBe(1);
  });

  it("ignores follow-ups already resolved", () => {
    const s = snapshot({
      followUps: [
        followUp({ dueDate: "2026-01-01", status: "completed" }),
        followUp({ dueDate: "2026-01-01", status: "cancelled" }),
        followUp({ dueDate: "2026-01-01", status: "pending" }),
      ],
    });
    expect(valueOf(overdueFollowUps, s)).toBe(1);
  });

  it("compares ISO dates lexically across month and year boundaries", () => {
    const s = snapshot({
      followUps: [
        followUp({ dueDate: "2025-12-31" }),
        followUp({ dueDate: "2026-07-09" }),
        followUp({ dueDate: "2026-12-31" }),
      ],
    });
    expect(valueOf(overdueFollowUps, s)).toBe(2);
  });

  it("reports zero on an empty snapshot", () => {
    expect(valueOf(followUpsDueToday, snapshot())).toBe(0);
    expect(valueOf(overdueFollowUps, snapshot())).toBe(0);
  });
});
