/**
 * lib/__tests__/data-export.spec.ts
 *
 * An export is the largest single disclosure the product makes, so the rules
 * about its contents are worth pinning as assertions rather than as a comment.
 *
 * The failure that matters is a widening one: someone adds `select("*")` during
 * a refactor and a patient's self-service download starts containing the
 * dentist's private notes, or the clinic's consultant fee splits, or a column
 * added last week that nobody thought about.
 */

import { describe, it, expect } from "vitest";
import {
  NEVER_EXPORTED_TREATMENT_FIELDS,
  PATIENT_TREATMENT_FIELDS,
  STAFF_ONLY_TREATMENT_FIELDS,
  exclusionsFor,
  pickTreatmentFields,
  treatmentFieldsFor,
} from "../data-export";

/** A treatment row as `select("*")` would return it — everything. */
const FULL_ROW = {
  id: "t1",
  clinic_id: "c1",
  patient_id: "p1",
  appointment_id: "a1",
  treatment_type: "Root Canal",
  patient_visible_notes: "Upper left molar",
  internal_notes: "suspected vertical fracture, review at 6 weeks",
  medications: [{ name: "Amoxicillin" }],
  cost: 8000,
  status: "completed",
  performed_at: "2026-08-10T00:00:00Z",
  tooth_number: 26,
  dentition_type: "adult",
  created_at: "2026-08-10T00:00:00Z",
  opd_charged: true,
  opd_fee: 300,
  xray_taken: true,
  xray_cost: 400,
  // The clinic's commercial arrangements, attached to the row for accounting.
  consultant_id: "con-1",
  commission_type: "percentage",
  commission_value: 30,
  consultant_share: 2400,
  clinic_share: 5600,
  created_by: "d1",
  deleted_at: null,
};

describe("a patient's own export", () => {
  const exported = pickTreatmentFields(FULL_ROW, "patient");

  it("does not contain the dentist's private clinical notes", () => {
    // The portal has never shown internal_notes. Changing that silently, inside
    // an export feature, would be a clinical-disclosure decision made by
    // accident.
    expect(exported).not.toHaveProperty("internal_notes");
  });

  it("does not contain the clinic's consultant fee arrangements", () => {
    for (const field of NEVER_EXPORTED_TREATMENT_FIELDS) {
      expect(exported).not.toHaveProperty(field);
    }
  });

  it("does not leak internal identifiers that are nobody's record", () => {
    for (const field of ["clinic_id", "created_by", "deleted_at"]) {
      expect(exported).not.toHaveProperty(field);
    }
  });

  it("still contains what a patient actually needs", () => {
    // Non-vacuous: minimisation must not have emptied the export.
    expect(exported.treatment_type).toBe("Root Canal");
    expect(exported.cost).toBe(8000);
    expect(exported.medications).toEqual([{ name: "Amoxicillin" }]);
    expect(exported.patient_visible_notes).toBe("Upper left molar");
    expect(exported.performed_at).toBe("2026-08-10T00:00:00Z");
  });

  it("says what it left out", () => {
    const excluded = exclusionsFor("patient");
    expect(excluded.join(" ")).toMatch(/internal_notes/);
    expect(excluded.join(" ")).toMatch(/other patient/i);
    expect(excluded.join(" ")).toMatch(/other clinic/i);
    expect(excluded.join(" ")).toMatch(/logs/i);
  });
});

describe("a dentist's export on the patient's behalf", () => {
  const exported = pickTreatmentFields(FULL_ROW, "staff");

  it("includes the clinician's own notes — it is their record to hand over", () => {
    expect(exported.internal_notes).toBe(
      "suspected vertical fracture, review at 6 weeks"
    );
  });

  it("still never includes the consultant fee split", () => {
    // A third party's pay is not a fact about the patient, in either scope.
    for (const field of NEVER_EXPORTED_TREATMENT_FIELDS) {
      expect(exported).not.toHaveProperty(field);
    }
  });
});

describe("the two field lists cannot drift into each other", () => {
  it("keeps the never-exported set out of both scopes", () => {
    for (const scope of ["patient", "staff"] as const) {
      const fields = treatmentFieldsFor(scope);
      for (const forbidden of NEVER_EXPORTED_TREATMENT_FIELDS) {
        expect(fields).not.toContain(forbidden);
      }
    }
  });

  it("keeps staff-only fields out of the patient list", () => {
    for (const field of STAFF_ONLY_TREATMENT_FIELDS) {
      expect(PATIENT_TREATMENT_FIELDS as readonly string[]).not.toContain(field);
    }
  });

  it("gives staff a strict superset of what a patient gets", () => {
    const patient = treatmentFieldsFor("patient");
    const staff = treatmentFieldsFor("staff");
    for (const field of patient) expect(staff).toContain(field);
    expect(staff.length).toBeGreaterThan(patient.length);
  });
});

describe("pickTreatmentFields is a genuine allow-list", () => {
  it("drops a column nobody has thought about yet", () => {
    // The realistic future failure: a migration adds a column, a select("*")
    // picks it up, and it appears in an export nobody re-reviewed.
    const withNewColumn = { ...FULL_ROW, insurance_claim_reference: "CLAIM-9" };
    expect(pickTreatmentFields(withNewColumn, "patient")).not.toHaveProperty(
      "insurance_claim_reference"
    );
    expect(pickTreatmentFields(withNewColumn, "staff")).not.toHaveProperty(
      "insurance_claim_reference"
    );
  });
});
