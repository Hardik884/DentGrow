/**
 * lib/legal/__tests__/links.spec.ts
 *
 * Guards the sign-in pages' legal links.
 *
 * The two things that actually go wrong here:
 *   1. someone hardcodes a placeholder domain, and the Privacy Policy link on
 *      every sign-in page points at nothing;
 *   2. someone adds a Terms link before Terms exist, and the sentence a person
 *      is asked to agree to leads to a 404.
 *
 * Both are asserted rather than described.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  isUsableLegalUrl,
  marketingOrigin,
  privacyPolicyUrl,
  termsUrl,
} from "../links";

const ORIGINAL = {
  marketing: process.env.NEXT_PUBLIC_MARKETING_URL,
  terms: process.env.NEXT_PUBLIC_TERMS_URL,
};

afterEach(() => {
  if (ORIGINAL.marketing === undefined) delete process.env.NEXT_PUBLIC_MARKETING_URL;
  else process.env.NEXT_PUBLIC_MARKETING_URL = ORIGINAL.marketing;
  if (ORIGINAL.terms === undefined) delete process.env.NEXT_PUBLIC_TERMS_URL;
  else process.env.NEXT_PUBLIC_TERMS_URL = ORIGINAL.terms;
});

describe("marketing origin", () => {
  it("defaults to the real production origin, not a placeholder", () => {
    delete process.env.NEXT_PUBLIC_MARKETING_URL;
    expect(marketingOrigin()).toBe("https://oramedha.com");
  });

  it("is overridable for preview deployments", () => {
    process.env.NEXT_PUBLIC_MARKETING_URL = "https://preview.oramedha.com/";
    expect(marketingOrigin()).toBe("https://preview.oramedha.com");
  });

  it("ignores a value that is not an absolute http(s) URL", () => {
    for (const bad of ["", "   ", "/privacy", "javascript:alert(1)", "oramedha.com"]) {
      process.env.NEXT_PUBLIC_MARKETING_URL = bad;
      expect(marketingOrigin()).toBe("https://oramedha.com");
    }
  });
});

describe("privacy policy URL", () => {
  it("points at the marketing site's published /privacy route", () => {
    delete process.env.NEXT_PUBLIC_MARKETING_URL;
    expect(privacyPolicyUrl()).toBe("https://oramedha.com/privacy");
  });

  it("contains no placeholder domain", () => {
    delete process.env.NEXT_PUBLIC_MARKETING_URL;
    const url = privacyPolicyUrl();
    for (const placeholder of ["example.com", "your-domain", "localhost", "TODO"]) {
      expect(url).not.toContain(placeholder);
    }
  });
});

describe("terms URL", () => {
  it("is null while no Terms page is published, so no dead link is rendered", () => {
    delete process.env.NEXT_PUBLIC_TERMS_URL;
    expect(termsUrl()).toBeNull();
  });

  it("is used once configured", () => {
    process.env.NEXT_PUBLIC_TERMS_URL = "https://oramedha.com/terms/";
    expect(termsUrl()).toBe("https://oramedha.com/terms");
  });

  it("rejects a non-URL rather than rendering it", () => {
    process.env.NEXT_PUBLIC_TERMS_URL = "coming-soon";
    expect(termsUrl()).toBeNull();
  });
});

describe("isUsableLegalUrl", () => {
  it("accepts absolute http and https only", () => {
    expect(isUsableLegalUrl("https://a.example")).toBe(true);
    expect(isUsableLegalUrl("http://a.example")).toBe(true);
    expect(isUsableLegalUrl("ftp://a.example")).toBe(false);
    expect(isUsableLegalUrl(undefined)).toBe(false);
    expect(isUsableLegalUrl(null)).toBe(false);
  });
});
