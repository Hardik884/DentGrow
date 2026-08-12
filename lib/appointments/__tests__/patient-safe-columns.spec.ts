/**
 * Regression: the patient portal must never receive staff-internal appointment
 * fields (audit A1/A2). The privacy guarantee is the allow-list itself — these
 * pin it so it can never quietly grow to include a clinical column, and so
 * `appointments.notes` in particular stays out.
 */

import { describe, expect, it } from "vitest";

import {
  CLINICAL_APPOINTMENT_COLUMNS,
  PATIENT_APPOINTMENT_SELECT,
  PATIENT_SAFE_APPOINTMENT_COLUMNS,
} from "../patient-safe-columns";

describe("patient-safe appointment columns (audit A1/A2)", () => {
  it("never lists a clinical / staff-internal column as patient-safe", () => {
    for (const clinical of CLINICAL_APPOINTMENT_COLUMNS) {
      expect(PATIENT_SAFE_APPOINTMENT_COLUMNS as readonly string[]).not.toContain(clinical);
    }
  });

  it("keeps the safe and clinical sets disjoint", () => {
    const overlap = (PATIENT_SAFE_APPOINTMENT_COLUMNS as readonly string[]).filter((c) =>
      (CLINICAL_APPOINTMENT_COLUMNS as readonly string[]).includes(c),
    );
    expect(overlap).toEqual([]);
  });

  it("builds a portal select string that excludes every clinical field", () => {
    for (const clinical of CLINICAL_APPOINTMENT_COLUMNS) {
      expect(PATIENT_APPOINTMENT_SELECT).not.toMatch(new RegExp(`\\b${clinical}\\b`));
    }
  });

  it("explicitly excludes appointments.notes — the field that leaked", () => {
    expect(PATIENT_SAFE_APPOINTMENT_COLUMNS as readonly string[]).not.toContain("notes");
    expect(PATIENT_APPOINTMENT_SELECT).not.toMatch(/\bnotes\b/);
  });

  it("still selects the basics the portal legitimately needs", () => {
    expect(PATIENT_APPOINTMENT_SELECT).toContain("scheduled_at");
    expect(PATIENT_APPOINTMENT_SELECT).toContain("duration_minutes");
    expect(PATIENT_APPOINTMENT_SELECT).toContain("status");
    expect(PATIENT_APPOINTMENT_SELECT).toContain("patient:patients(");
  });
});
