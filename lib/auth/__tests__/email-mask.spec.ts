/**
 * The address on /patient/verify-email is the one piece of personal data that
 * screen shows, and it is shown so a patient can catch their own typo. These
 * pin both halves of that bargain: enough survives to spot a mistake, and the
 * length of what is hidden never leaks.
 */

import { describe, expect, it } from "vitest";

import { maskEmail } from "../email-mask";

describe("maskEmail", () => {
  it("keeps the first character and the whole domain", () => {
    expect(maskEmail("hardik@gmail.com")).toBe("h••••@gmail.com");
  });

  it("hides the same amount regardless of how long the local part is", () => {
    // A length-preserving mask would publish how many characters to guess at.
    const short = maskEmail("ab@clinic.in")!;
    const long = maskEmail("a-very-long-local-part@clinic.in")!;
    expect(short.indexOf("@")).toBe(long.indexOf("@"));
  });

  it("never emits any character of the local part beyond the first", () => {
    const masked = maskEmail("meera.patel@dentgrow.test")!;
    expect(masked).toBe("m••••@dentgrow.test");
    expect(masked).not.toContain("eera");
    expect(masked).not.toContain("patel");
  });

  it("handles a single-character local part without breaking", () => {
    expect(maskEmail("a@x.co")).toBe("a••••@x.co");
  });

  it("masks against the LAST @, so a quoted local part can't smuggle a domain", () => {
    expect(maskEmail("we@ird@dentgrow.test")).toBe("w••••@dentgrow.test");
  });

  it("trims incidental whitespace rather than masking it", () => {
    expect(maskEmail("  hardik@gmail.com  ")).toBe("h••••@gmail.com");
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["null", null],
    ["undefined", undefined],
    ["no @", "not-an-email"],
    ["nothing before the @", "@gmail.com"],
    ["nothing after the @", "hardik@"],
    ["domain with no dot", "hardik@localhost"],
  ])("returns null for %s so the caller can fall back to generic copy", (_label, input) => {
    expect(maskEmail(input)).toBeNull();
  });
});
