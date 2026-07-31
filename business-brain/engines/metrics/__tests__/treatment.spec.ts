import { describe, expect, it } from "vitest";

import {
  acceptedTreatmentsPendingScheduling,
  treatmentsCompletedToday,
} from "../calculators/treatment-metrics";
import { DATE, isWithheld, snapshot, treatment, valueOf } from "./fixtures/snapshot-fixtures";

describe("acceptedTreatmentsPendingScheduling", () => {
  it("counts planned treatments not booked for a future appointment", () => {
    const s = snapshot({
      treatments: [
        treatment({ status: "planned", isScheduled: false }),
        treatment({ status: "planned", isScheduled: false }),
        // Accepted today, booked for a future visit — not pending scheduling.
        treatment({ status: "planned", isScheduled: true }),
      ],
    });
    expect(valueOf(acceptedTreatmentsPendingScheduling, s)).toBe(2);
  });

  it("WITHHOLDS the metric when any planned treatment's booking state is unknown", () => {
    const s = snapshot({
      treatments: [
        treatment({ status: "planned", isScheduled: false }),
        treatment({ status: "planned", isScheduled: null }),
      ],
    });
    // Counting the unknown as "not scheduled" would report accepted work as
    // unbooked on no evidence. Withholding makes the evaluator skip instead.
    expect(isWithheld(acceptedTreatmentsPendingScheduling, s)).toBe(true);
  });

  it("still measures when the unknown treatment is not planned", () => {
    // A completed treatment's booking state is irrelevant to this metric.
    const s = snapshot({
      treatments: [
        treatment({ status: "planned", isScheduled: false }),
        treatment({ status: "completed", isScheduled: null }),
      ],
    });
    expect(valueOf(acceptedTreatmentsPendingScheduling, s)).toBe(1);
  });

  it("reports zero when there are no planned treatments, whatever is knowable", () => {
    const s = snapshot({ treatments: [treatment({ status: "completed", isScheduled: null })] });
    expect(valueOf(acceptedTreatmentsPendingScheduling, s)).toBe(0);
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
