import { describe, it, expect } from "vitest";
import {
  selectTemplateKeyForTreatmentType,
  selectTemplateForTreatmentType,
  DEFAULT_CONSENT_TEMPLATES,
  DEFAULT_TEMPLATE_BY_KEY,
  DEFAULT_CONSENT_DISCLAIMER,
  CONSENT_TEMPLATE_KEYS,
} from "@/lib/consents/templates";

describe("consent template auto-selection", () => {
  it("maps the built-in treatment types to their specific templates", () => {
    // Values from types/index.ts TREATMENT_TYPE_OPTIONS.
    expect(selectTemplateKeyForTreatmentType("Root Canal Treatment")).toBe("root_canal");
    expect(selectTemplateKeyForTreatmentType("Extraction")).toBe("extraction");
    expect(selectTemplateKeyForTreatmentType("Surgical Extraction")).toBe("extraction");
    expect(selectTemplateKeyForTreatmentType("Implant")).toBe("implant");
    expect(selectTemplateKeyForTreatmentType("Crown Treatment")).toBe("crown_bridge");
    expect(selectTemplateKeyForTreatmentType("Orthodontic Treatment")).toBe("orthodontic");
    expect(selectTemplateKeyForTreatmentType("Restoration")).toBe("filling");
    expect(selectTemplateKeyForTreatmentType("Scaling")).toBe("periodontal");
  });

  it("is case-insensitive and matches on substrings / synonyms", () => {
    expect(selectTemplateKeyForTreatmentType("root canal re-treatment")).toBe("root_canal");
    expect(selectTemplateKeyForTreatmentType("RCT upper left")).toBe("root_canal");
    expect(selectTemplateKeyForTreatmentType("clear aligners")).toBe("orthodontic");
    expect(selectTemplateKeyForTreatmentType("braces")).toBe("orthodontic");
    expect(selectTemplateKeyForTreatmentType("composite filling")).toBe("filling");
    expect(selectTemplateKeyForTreatmentType("deep gum cleaning")).toBe("periodontal");
    expect(selectTemplateKeyForTreatmentType("Bridge work")).toBe("crown_bridge");
  });

  it("falls back to the general template when nothing matches", () => {
    expect(selectTemplateKeyForTreatmentType("OPD")).toBe("general");
    expect(selectTemplateKeyForTreatmentType("Bleaching")).toBe("general");
    expect(selectTemplateKeyForTreatmentType("Denture")).toBe("general");
    expect(selectTemplateKeyForTreatmentType("something unheard of")).toBe("general");
  });

  it("falls back to general for empty / null / whitespace input", () => {
    expect(selectTemplateKeyForTreatmentType("")).toBe("general");
    expect(selectTemplateKeyForTreatmentType("   ")).toBe("general");
    expect(selectTemplateKeyForTreatmentType(null)).toBe("general");
    expect(selectTemplateKeyForTreatmentType(undefined)).toBe("general");
  });

  it("selectTemplateForTreatmentType returns the full definition", () => {
    const def = selectTemplateForTreatmentType("Root Canal Treatment");
    expect(def.key).toBe("root_canal");
    expect(def.name).toBe("Root Canal Treatment Consent");
    expect(def.content.sections.length).toBeGreaterThan(0);
  });
});

describe("default consent templates integrity", () => {
  it("has exactly one definition per declared key, general last", () => {
    expect(DEFAULT_CONSENT_TEMPLATES.length).toBe(CONSENT_TEMPLATE_KEYS.length);
    const keys = DEFAULT_CONSENT_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[keys.length - 1]).toBe("general");
    for (const key of CONSENT_TEMPLATE_KEYS) {
      expect(DEFAULT_TEMPLATE_BY_KEY[key]).toBeDefined();
    }
  });

  it("general is the only template with no keywords (the fallback)", () => {
    for (const t of DEFAULT_CONSENT_TEMPLATES) {
      if (t.key === "general") expect(t.treatmentKeywords).toHaveLength(0);
      else expect(t.treatmentKeywords.length).toBeGreaterThan(0);
    }
  });

  it("every template ships the review disclaimer and full section set", () => {
    for (const t of DEFAULT_CONSENT_TEMPLATES) {
      expect(t.content.disclaimer).toBe(DEFAULT_CONSENT_DISCLAIMER);
      const sectionKeys = t.content.sections.map((s) => s.key);
      // must include the informed-consent essentials
      for (const required of [
        "diagnosis",
        "procedure_detail",
        "benefits",
        "risks_common",
        "risks_serious",
        "alternatives",
        "limitations",
        "aftercare",
        "questions",
        "acknowledgement",
        "voluntary",
      ]) {
        expect(sectionKeys).toContain(required);
      }
    }
  });

  it("the fixed acknowledgement / questions / voluntary sections are not per-consent editable", () => {
    for (const t of DEFAULT_CONSENT_TEMPLATES) {
      for (const s of t.content.sections) {
        if (["questions", "acknowledgement", "voluntary"].includes(s.key)) {
          expect(s.editablePerConsent).toBe(false);
        }
      }
    }
  });

  it("contains no manipulative / rights-waiver language", () => {
    const banned = [
      "waive",
      "waiver",
      "all possible complications",
      "not responsible",
      "no liability",
      "release the clinic",
      "give up",
    ];
    for (const t of DEFAULT_CONSENT_TEMPLATES) {
      const text = (
        t.content.disclaimer + " " + t.content.sections.map((s) => s.body).join(" ")
      ).toLowerCase();
      for (const phrase of banned) {
        expect(text.includes(phrase), `${t.key} must not contain "${phrase}"`).toBe(false);
      }
    }
  });

  it("the disclaimer does not assert legal sufficiency", () => {
    expect(DEFAULT_CONSENT_DISCLAIMER.toLowerCase()).toContain("does not");
    expect(DEFAULT_CONSENT_DISCLAIMER.toLowerCase()).toContain("review");
  });
});
