import { describe, expect, it } from "vitest";

import { newPatientsToday, returningPatientsToday } from "../calculators/patient-metrics";
import { DATE, patient, snapshot, valueOf } from "./fixtures/snapshot-fixtures";

describe("newPatientsToday", () => {
  it("counts records created on the target date", () => {
    const s = snapshot({ patientsRegisteredToday: [patient(), patient(), patient()] });
    expect(valueOf(newPatientsToday, s)).toBe(3);
  });

  it("reports zero when nobody registered", () => {
    expect(valueOf(newPatientsToday, snapshot())).toBe(0);
  });
});

describe("returningPatientsToday", () => {
  it("counts patients seen today whose record predates today", () => {
    const s = snapshot({
      patientsSeenToday: [
        patient({ id: "p1", createdAt: "2026-01-15T10:00:00.000Z" }),
        patient({ id: "p2", createdAt: "2025-11-02T10:00:00.000Z" }),
      ],
    });
    expect(valueOf(returningPatientsToday, s)).toBe(2);
  });

  it("treats a patient registered today as new, never returning", () => {
    const s = snapshot({
      patientsSeenToday: [patient({ id: "p1", createdAt: `${DATE}T08:00:00.000Z` })],
    });
    expect(valueOf(returningPatientsToday, s)).toBe(0);
  });

  it("deduplicates a patient with several appointments on the same day", () => {
    const s = snapshot({
      patientsSeenToday: [
        patient({ id: "p1", createdAt: "2026-01-15T10:00:00.000Z" }),
        patient({ id: "p1", createdAt: "2026-01-15T10:00:00.000Z" }),
        patient({ id: "p1", createdAt: "2026-01-15T10:00:00.000Z" }),
      ],
    });
    expect(valueOf(returningPatientsToday, s)).toBe(1);
  });

  it("separates new from returning within the same day", () => {
    const s = snapshot({
      patientsRegisteredToday: [patient({ id: "new1" })],
      patientsSeenToday: [
        patient({ id: "new1", createdAt: `${DATE}T09:00:00.000Z` }),
        patient({ id: "old1", createdAt: "2026-02-01T09:00:00.000Z" }),
      ],
    });
    expect(valueOf(newPatientsToday, s)).toBe(1);
    expect(valueOf(returningPatientsToday, s)).toBe(1);
  });
});
