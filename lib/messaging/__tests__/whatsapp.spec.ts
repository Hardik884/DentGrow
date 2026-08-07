/**
 * Specs for the pure WhatsApp helpers.
 *
 * The number sanitiser is the load-bearing one: patients.phone is free text,
 * nullable, and stored without a guaranteed country code, so a wrong wa.me
 * number sends a patient's reminder to a stranger. These pin every shape the
 * real data takes.
 */

import { describe, expect, it } from "vitest";

import {
  buildWhatsAppLink,
  fillTemplate,
  hasUnfilledPlaceholders,
  sanitizeWhatsAppNumber,
} from "../whatsapp";

describe("sanitizeWhatsAppNumber", () => {
  it("prepends the default country code to a bare 10-digit mobile", () => {
    expect(sanitizeWhatsAppNumber("9845010001")).toBe("919845010001");
  });

  it("keeps a number that already carries a country code", () => {
    expect(sanitizeWhatsAppNumber("+91 98450 12345")).toBe("919845012345");
  });

  it("strips punctuation and spacing before deciding", () => {
    expect(sanitizeWhatsAppNumber("(98450) 10-001")).toBe("919845010001");
  });

  it("drops a leading trunk zero", () => {
    expect(sanitizeWhatsAppNumber("09845010001")).toBe("919845010001");
  });

  it("returns null for a missing number", () => {
    expect(sanitizeWhatsAppNumber(null)).toBeNull();
    expect(sanitizeWhatsAppNumber(undefined)).toBeNull();
    expect(sanitizeWhatsAppNumber("")).toBeNull();
  });

  it("returns null for a number too short to dial", () => {
    expect(sanitizeWhatsAppNumber("12345")).toBeNull();
  });

  it("returns null for an implausibly long number", () => {
    expect(sanitizeWhatsAppNumber("1234567890123456")).toBeNull();
  });

  it("honours a non-default country code when asked", () => {
    expect(sanitizeWhatsAppNumber("2025550187", "1")).toBe("12025550187");
  });
});

describe("buildWhatsAppLink", () => {
  it("builds a wa.me link with the message url-encoded", () => {
    const link = buildWhatsAppLink("9845010001", "Hello Ananya, it's time for a check-up.");
    expect(link).toBe(
      "https://wa.me/919845010001?text=Hello%20Ananya%2C%20it's%20time%20for%20a%20check-up.",
    );
  });

  it("returns null when the number is unusable, so the caller shows a fallback", () => {
    expect(buildWhatsAppLink(null, "hi")).toBeNull();
    expect(buildWhatsAppLink("123", "hi")).toBeNull();
  });
});

describe("fillTemplate", () => {
  const body =
    "Hello {{patient_name}}, an outstanding balance of {{amount}} at {{clinic_name}}. Call {{clinic_phone}}.";

  it("replaces every marker when all values are supplied, leaving none behind", () => {
    const out = fillTemplate(body, {
      patient_name: "Ananya",
      amount: "₹9,000",
      clinic_name: "Dr. Liying's",
      clinic_phone: "+91 98450 12345",
    });
    expect(out).toBe(
      "Hello Ananya, an outstanding balance of ₹9,000 at Dr. Liying's. Call +91 98450 12345.",
    );
    expect(hasUnfilledPlaceholders(out)).toBe(false);
  });

  it("leaves an unsupplied marker intact rather than blanking it", () => {
    const out = fillTemplate(body, { patient_name: "Ananya" });
    expect(out).toContain("{{amount}}");
    expect(hasUnfilledPlaceholders(out)).toBe(true);
  });
});
