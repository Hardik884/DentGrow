import { describe, it, expect } from "vitest";
import {
  canTransition,
  isConsentEditable,
  canSignConsent,
  canCancelConsent,
  isConsentImmutable,
  consentStatusLabel,
  CONSENT_STATUSES,
} from "@/lib/consents/status";

describe("consent status transitions", () => {
  it("allows the forward lifecycle from draft", () => {
    expect(canTransition("draft", "ready_to_sign")).toBe(true);
    expect(canTransition("draft", "signed")).toBe(true);
    expect(canTransition("draft", "cancelled")).toBe(true);
  });

  it("allows ready_to_sign to go back to draft, forward to signed, or cancel", () => {
    expect(canTransition("ready_to_sign", "draft")).toBe(true);
    expect(canTransition("ready_to_sign", "signed")).toBe(true);
    expect(canTransition("ready_to_sign", "cancelled")).toBe(true);
  });

  it("treats signed as terminal and immutable — no transition out is allowed", () => {
    for (const to of CONSENT_STATUSES) {
      expect(canTransition("signed", to)).toBe(false);
    }
  });

  it("treats cancelled as terminal", () => {
    for (const to of CONSENT_STATUSES) {
      expect(canTransition("cancelled", to)).toBe(false);
    }
  });
});

describe("consent editability / immutability", () => {
  it("only draft and ready_to_sign are editable", () => {
    expect(isConsentEditable("draft")).toBe(true);
    expect(isConsentEditable("ready_to_sign")).toBe(true);
    expect(isConsentEditable("signed")).toBe(false);
    expect(isConsentEditable("cancelled")).toBe(false);
  });

  it("a signed consent is immutable", () => {
    expect(isConsentImmutable("signed")).toBe(true);
    expect(isConsentImmutable("draft")).toBe(false);
    expect(isConsentImmutable("ready_to_sign")).toBe(false);
    expect(isConsentImmutable("cancelled")).toBe(false);
  });
});

describe("signing rules", () => {
  it("only a digital, unsigned consent can be signed in-app", () => {
    expect(canSignConsent("draft", "digital")).toBe(true);
    expect(canSignConsent("ready_to_sign", "digital")).toBe(true);
    expect(canSignConsent("signed", "digital")).toBe(false);
    expect(canSignConsent("cancelled", "digital")).toBe(false);
  });

  it("an uploaded consent is never digitally signed in-app", () => {
    expect(canSignConsent("draft", "uploaded")).toBe(false);
    expect(canSignConsent("ready_to_sign", "uploaded")).toBe(false);
  });
});

describe("cancellation rules", () => {
  it("only draft / ready_to_sign consents can be cancelled", () => {
    expect(canCancelConsent("draft")).toBe(true);
    expect(canCancelConsent("ready_to_sign")).toBe(true);
    expect(canCancelConsent("signed")).toBe(false);
    expect(canCancelConsent("cancelled")).toBe(false);
  });
});

describe("status labels distinguish digital vs uploaded signed consents", () => {
  it("labels a digitally-signed consent distinctly from an uploaded one", () => {
    expect(consentStatusLabel("signed", "digital")).toBe("Digitally Signed");
    expect(consentStatusLabel("signed", "uploaded")).toBe("Patient Signed — Uploaded");
  });

  it("labels the working statuses the same regardless of source", () => {
    expect(consentStatusLabel("draft", "digital")).toBe("Draft");
    expect(consentStatusLabel("draft", "uploaded")).toBe("Draft");
    expect(consentStatusLabel("ready_to_sign", "digital")).toBe("Ready to Sign");
    expect(consentStatusLabel("cancelled", "digital")).toBe("Cancelled");
  });
});
