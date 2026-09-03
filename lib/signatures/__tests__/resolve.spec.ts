/**
 * lib/signatures/__tests__/resolve.spec.ts
 *
 * The dentist-signatures bucket was public, so profiles.signature_url holds
 * absolute public URLs on every row written before 20260903000400 and object
 * paths on every row written since. Both must resolve, or a clinic's
 * prescriptions silently lose their signature the day the bucket goes private.
 *
 * signatureObjectPathFrom is the function that decides, so it is tested
 * directly — including the values that must NOT resolve.
 */

import { describe, it, expect } from "vitest";
import { signatureObjectPathFrom, SIGNATURE_URL_TTL_SECONDS } from "../resolve";

const CLINIC = "00000000-0000-0000-0000-000000000001";
const DENTIST = "11111111-1111-1111-1111-111111111111";
const PATH = `${CLINIC}/${DENTIST}/signature.png`;

describe("legacy public URLs still resolve", () => {
  it("extracts the object path from a stored public URL", () => {
    expect(
      signatureObjectPathFrom(
        `https://proj.supabase.co/storage/v1/object/public/dentist-signatures/${PATH}`
      )
    ).toBe(PATH);
  });

  it("ignores the cache-buster the old upload appended", () => {
    expect(
      signatureObjectPathFrom(
        `https://proj.supabase.co/storage/v1/object/public/dentist-signatures/${PATH}?v=1750000000000`
      )
    ).toBe(PATH);
  });

  it("decodes a percent-encoded path", () => {
    expect(
      signatureObjectPathFrom(
        "https://proj.supabase.co/storage/v1/object/public/dentist-signatures/a%2Fb/signature.png"
      )
    ).toBe("a/b/signature.png");
  });
});

describe("new path values resolve", () => {
  it("passes a bare object path through", () => {
    expect(signatureObjectPathFrom(PATH)).toBe(PATH);
  });

  it("strips a query string from a path", () => {
    expect(signatureObjectPathFrom(`${PATH}?v=2`)).toBe(PATH);
  });
});

describe("nothing else resolves", () => {
  it("returns null for absent or empty values", () => {
    expect(signatureObjectPathFrom(null)).toBeNull();
    expect(signatureObjectPathFrom(undefined)).toBeNull();
    expect(signatureObjectPathFrom("")).toBeNull();
    expect(signatureObjectPathFrom("   ")).toBeNull();
  });

  it("refuses a URL pointing at a different bucket", () => {
    // Signing an arbitrary path because it happened to be in this column would
    // turn a profile field into a way to read another bucket.
    expect(
      signatureObjectPathFrom(
        `https://proj.supabase.co/storage/v1/object/public/patient-documents/${PATH}`
      )
    ).toBeNull();
  });

  it("refuses a URL pointing at another site", () => {
    expect(signatureObjectPathFrom("https://evil.example/signature.png")).toBeNull();
  });

  it("refuses path traversal", () => {
    expect(signatureObjectPathFrom("../../secrets/key.png")).toBeNull();
    expect(
      signatureObjectPathFrom(
        "https://proj.supabase.co/storage/v1/object/public/dentist-signatures/../../x"
      )
    ).toBeNull();
  });
});

describe("lifetime", () => {
  it("is bounded, and longer than a document URL for a stated reason", () => {
    // A signature is rendered into invoices and prescriptions that get printed
    // to PDF client-side minutes after the page loaded; five minutes would
    // produce blank signatures that look like a rendering bug. An hour is still
    // decisively better than the permanent public URL it replaces.
    expect(SIGNATURE_URL_TTL_SECONDS).toBe(3600);
    expect(SIGNATURE_URL_TTL_SECONDS).toBeLessThanOrEqual(3600);
  });
});
