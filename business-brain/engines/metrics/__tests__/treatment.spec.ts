import { describe, expect, it } from "vitest";

import {
  acceptedTreatmentsPendingScheduling,
  treatmentsCompletedToday,
} from "../calculators/treatment-metrics";
import { DATE, snapshot, treatment, valueOf } from "./fixtures/snapshot-fixtures";

describe("acceptedTreatmentsPendingScheduling", () => {
  it("counts planned treatments that have no appointment yet", () => {
    const s = snapshot({
      treatments: [
        treatment({ status: "planned", isScheduled: false }),
        treatment({ status: "planned", isScheduled: false }),
        treatment({ status: "planned", isScheduled: true }),
      ],
    });
    expect(valueOf(acceptedTreatmentsPendingScheduling, s)).toBe(2);
  });

  it("ignores treatments that are already under way or finished", () => {
    const s = snapshot({
      treatments: [
        treatment({ status: "in_progress", isScheduled: false }),
        treatment({ status: "completed", isScheduled: false }),
        treatment({ status: "cancelled", isScheduled: false }),
      ],
    });
    expect(valueOf(acceptedTreatmentsPendingScheduling, s)).toBe(0);
  });
});

describe("treatmentsCompletedToday", () => {
  it("counts completed treatments performed on the target date", () => {
    const s = snapshot({
      treatments: [
        treatment({ status: "completed", performedAt: `${DATE}T09:00:00.000Z` }),
        treatment({ status: "completed", performedAt: `${DATE}T23:59:59.000Z` }),
      ],
    });
    expect(valueOf(treatmentsCompletedToday, s)).toBe(2);
  });

  it("ignores completed treatments performed on another date", () => {
    const s = snapshot({
      treatments: [
        treatment({ status: "completed", performedAt: "2026-07-27T23:59:59.000Z" }),
        treatment({ status: "completed", performedAt: "2026-07-29T00:00:00.000Z" }),
      ],
    });
    expect(valueOf(treatmentsCompletedToday, s)).toBe(0);
  });

  it("ignores a completed treatment with no performed_at", () => {
    const s = snapshot({
      treatments: [treatment({ status: "completed", performedAt: null })],
    });
    expect(valueOf(treatmentsCompletedToday, s)).toBe(0);
  });

  it("ignores non-completed treatments performed today", () => {
    const s = snapshot({
      treatments: [
        treatment({ status: "in_progress", performedAt: `${DATE}T10:00:00.000Z` }),
        treatment({ status: "planned", performedAt: `${DATE}T10:00:00.000Z` }),
      ],
    });
    expect(valueOf(treatmentsCompletedToday, s)).toBe(0);
  });
});
