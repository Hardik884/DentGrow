import { describe, it, expect } from "vitest";
import { applyConsentEdits, ageFromDob, buildConsentSnapshot } from "@/lib/consents/build";
import { selectTemplateForTreatmentType } from "@/lib/consents/templates";

const baseContent = selectTemplateForTreatmentType("Root Canal Treatment").content;

describe("applyConsentEdits", () => {
  it("overrides an editable section without mutating the input", () => {
    const before = JSON.stringify(baseContent);
    const out = applyConsentEdits(baseContent, [
      { key: "diagnosis", body: "Patient-specific diagnosis text." },
    ]);
    const diagnosis = out.sections.find((s) => s.key === "diagnosis");
    expect(diagnosis?.body).toBe("Patient-specific diagnosis text.");
    // input untouched
    expect(JSON.stringify(baseContent)).toBe(before);
  });

  it("IGNORES edits targeting fixed (non-editable) sections", () => {
    const out = applyConsentEdits(baseContent, [
      { key: "voluntary", body: "I waive all my rights." },
    ]);
    const voluntary = out.sections.find((s) => s.key === "voluntary");
    const original = baseContent.sections.find((s) => s.key === "voluntary");
    expect(voluntary?.body).toBe(original?.body);
    expect(voluntary?.body).not.toContain("waive");
  });

  it("ignores unknown section keys (never invents sections)", () => {
    const out = applyConsentEdits(baseContent, [{ key: "nonexistent", body: "x" }]);
    expect(out.sections.length).toBe(baseContent.sections.length);
    expect(out.sections.find((s) => s.key === "nonexistent")).toBeUndefined();
  });

  it("returns a clone when there are no edits", () => {
    const out = applyConsentEdits(baseContent, []);
    expect(out).not.toBe(baseContent);
    expect(out.sections.length).toBe(baseContent.sections.length);
  });
});

describe("ageFromDob", () => {
  const now = new Date("2026-08-16T00:00:00Z");
  it("computes whole-year age", () => {
    expect(ageFromDob("1990-08-16", now)).toBe(36);
    expect(ageFromDob("1990-08-17", now)).toBe(35); // birthday not yet reached
    expect(ageFromDob("2000-01-01", now)).toBe(26);
  });
  it("returns null for missing/invalid dob", () => {
    expect(ageFromDob(null, now)).toBeNull();
    expect(ageFromDob("", now)).toBeNull();
    expect(ageFromDob("not-a-date", now)).toBeNull();
  });
});

describe("buildConsentSnapshot", () => {
  const now = new Date("2026-08-16T10:00:00Z");
  it("assembles a frozen snapshot from resolved parts", () => {
    const snap = buildConsentSnapshot({
      templateKey: "root_canal",
      templateName: "Root Canal Treatment Consent",
      templateVersion: 1,
      content: baseContent,
      patient: { name: "Asha Menon", phone: "9990000001", dob: "1990-01-01" },
      treatmentType: "Root Canal Treatment",
      clinic: {
        name: "My Dental Clinic",
        address: "123 St",
        phone: "111",
        email: "c@x.test",
        registrationNumber: "REG-1",
      },
      dentist: { name: "Dr. Demo", signatureUrl: "https://x/sig.png" },
      now,
    });
    expect(snap.templateVersion).toBe(1);
    expect(snap.patient.name).toBe("Asha Menon");
    expect(snap.patient.age).toBe(36);
    expect(snap.treatment.type).toBe("Root Canal Treatment");
    expect(snap.clinic.name).toBe("My Dental Clinic");
    expect(snap.dentist.name).toBe("Dr. Demo");
    expect(snap.frozenAt).toBe(now.toISOString());
    // content is cloned, not shared
    expect(snap.content).not.toBe(baseContent);
  });
});
