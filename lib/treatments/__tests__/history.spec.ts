/**
 * lib/treatments/__tests__/history.spec.ts
 *
 * diffFields is the part of treatment history that decides what the record
 * says, so it is the part worth pinning.
 *
 * Two failure modes matter and both are quiet:
 *   - recording too much: passing the whole row would make treatment_history a
 *     second, less-protected copy of the clinical record, with internal_notes
 *     duplicated on every save;
 *   - recording too little: a change that goes unrecorded is exactly the change
 *     the trail was added to be able to show.
 */

import { describe, it, expect } from "vitest";
import { diffFields } from "../history";

const BASE = {
  id: "t1",
  clinic_id: "c1",
  patient_id: "p1",
  treatment_type: "Root Canal",
  internal_notes: "suspected fracture",
  patient_visible_notes: "Upper left molar",
  medications: [{ name: "Amoxicillin", dose: "500mg" }],
  cost: 4500,
  status: "planned",
  opd_charged: false,
  opd_fee: 0,
  xray_taken: false,
  xray_cost: null,
  performed_at: null,
  tooth_number: 26,
  dentition_type: "adult",
  consultant_id: null,
  updated_at: "2026-09-01T10:00:00.000Z",
};

describe("diffFields", () => {
  it("records nothing when a save changed nothing", () => {
    // A form re-submitted unchanged must not leave a row claiming an edit.
    // updated_at differs on every write, so this also proves it is untracked.
    expect(diffFields(BASE, { ...BASE, updated_at: "2026-09-02T10:00:00.000Z" })).toBeNull();
  });

  it("records only the fields that actually changed", () => {
    const changed = diffFields(BASE, { ...BASE, cost: 5000, status: "completed" });

    expect(changed).not.toBeNull();
    expect(changed!.new).toEqual({ cost: 5000, status: "completed" });
    expect(changed!.old).toEqual({ cost: 4500, status: "planned" });
  });

  it("does not copy the untouched clinical notes into the trail", () => {
    const changed = diffFields(BASE, { ...BASE, cost: 5000 });

    // The whole point: internal_notes is dentist-only and must not be
    // duplicated into a table with different readers just because a price moved.
    expect(changed!.new).not.toHaveProperty("internal_notes");
    expect(changed!.old).not.toHaveProperty("internal_notes");
  });

  it("does record a note when the note is what changed", () => {
    const changed = diffFields(BASE, { ...BASE, internal_notes: "confirmed fracture" });

    expect(changed!.old).toEqual({ internal_notes: "suspected fracture" });
    expect(changed!.new).toEqual({ internal_notes: "confirmed fracture" });
  });

  it("compares medications by value, not by reference", () => {
    // Same content, different array identity — a reference comparison would
    // report a prescription change on every single save.
    const identical = diffFields(BASE, {
      ...BASE,
      medications: [{ name: "Amoxicillin", dose: "500mg" }],
    });
    expect(identical).toBeNull();

    const real = diffFields(BASE, {
      ...BASE,
      medications: [{ name: "Ibuprofen", dose: "400mg" }],
    });
    expect(real!.new).toHaveProperty("medications");
  });

  it("treats null and undefined as the same absence", () => {
    // The row shape differs between an insert result and a select, and a
    // spurious diff on every save would make the trail useless.
    const changed = diffFields(
      { ...BASE, xray_cost: null },
      { ...BASE, xray_cost: undefined }
    );
    expect(changed).toBeNull();
  });

  it("records a value appearing where there was none", () => {
    const changed = diffFields(BASE, { ...BASE, performed_at: "2026-09-02T09:00:00.000Z" });
    expect(changed!.old).toEqual({ performed_at: null });
    expect(changed!.new).toEqual({ performed_at: "2026-09-02T09:00:00.000Z" });
  });

  it("returns null rather than guessing when a row is missing", () => {
    expect(diffFields(null, BASE)).toBeNull();
    expect(diffFields(BASE, null)).toBeNull();
    expect(diffFields(undefined, undefined)).toBeNull();
  });

  it("ignores fields that are derived rather than decided", () => {
    // clinic_share and consultant_share are recomputed from cost and
    // consultant_id. Recording them too would triple the size of a diff that
    // already says what the dentist changed.
    const changed = diffFields(
      { ...BASE, clinic_share: 4500, consultant_share: 0 },
      { ...BASE, clinic_share: 3000, consultant_share: 1500 }
    );
    expect(changed).toBeNull();
  });
});
