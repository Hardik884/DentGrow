import { describe, expect, it } from "vitest";
import { normalizeIndianWhatsAppNumber, buildWhatsAppShareUrl } from "@/lib/whatsapp/phone";

describe("normalizeIndianWhatsAppNumber", () => {
  it("rejects a missing number", () => {
    expect(normalizeIndianWhatsAppNumber(null)).toEqual({ ok: false, reason: "missing" });
    expect(normalizeIndianWhatsAppNumber(undefined)).toEqual({ ok: false, reason: "missing" });
    expect(normalizeIndianWhatsAppNumber("")).toEqual({ ok: false, reason: "missing" });
    expect(normalizeIndianWhatsAppNumber("   ")).toEqual({ ok: false, reason: "missing" });
  });

  it("prepends 91 to a bare 10-digit Indian number", () => {
    expect(normalizeIndianWhatsAppNumber("9876543210")).toEqual({ ok: true, digits: "919876543210" });
  });

  it("handles a number with spaces/dashes", () => {
    expect(normalizeIndianWhatsAppNumber("98765-43210")).toEqual({ ok: true, digits: "919876543210" });
    expect(normalizeIndianWhatsAppNumber("98765 43210")).toEqual({ ok: true, digits: "919876543210" });
  });

  it("accepts an already +91-prefixed number", () => {
    expect(normalizeIndianWhatsAppNumber("+919876543210")).toEqual({ ok: true, digits: "919876543210" });
  });

  it("accepts a bare 91-prefixed number without +", () => {
    expect(normalizeIndianWhatsAppNumber("919876543210")).toEqual({ ok: true, digits: "919876543210" });
  });

  it("drops a leading trunk 0 on an 11-digit number", () => {
    expect(normalizeIndianWhatsAppNumber("09876543210")).toEqual({ ok: true, digits: "919876543210" });
  });

  it("passes through a plausible non-Indian international number", () => {
    expect(normalizeIndianWhatsAppNumber("+14155552671")).toEqual({ ok: true, digits: "14155552671" });
  });

  it("rejects too-short garbage", () => {
    expect(normalizeIndianWhatsAppNumber("12345")).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects non-numeric input", () => {
    expect(normalizeIndianWhatsAppNumber("call-the-clinic")).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects an implausibly long number", () => {
    expect(normalizeIndianWhatsAppNumber("1234567890123456789")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("buildWhatsAppShareUrl", () => {
  it("builds a wa.me link with the digits and URL-encoded message", () => {
    const url = buildWhatsAppShareUrl("919876543210", "Hello Asha, please find your bill from Clinic.");
    expect(url).toBe(
      "https://wa.me/919876543210?text=Hello%20Asha%2C%20please%20find%20your%20bill%20from%20Clinic."
    );
  });
});
