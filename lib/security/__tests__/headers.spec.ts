/**
 * lib/security/__tests__/headers.spec.ts
 *
 * The application shipped with no security headers at all. These assertions
 * exist so that stays fixed, and so the two ways a CSP goes wrong are caught
 * here rather than in a browser after deploy:
 *
 *   - it is too loose (a 'unsafe-inline' script-src is a CSP in name only);
 *   - it is too tight (a missing directive silently breaks X-ray previews,
 *     consent printing, or the Realtime queue).
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  STATIC_SECURITY_HEADERS,
  buildCsp,
  cspHeaderName,
  cspMode,
  generateNonce,
} from "../headers";

const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_CSP_MODE = process.env.CSP_MODE;

afterEach(() => {
  if (ORIGINAL_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  if (ORIGINAL_CSP_MODE === undefined) delete process.env.CSP_MODE;
  else process.env.CSP_MODE = ORIGINAL_CSP_MODE;
});

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name, values] as const;
      })
  );
}

describe("static security headers", () => {
  const byKey = new Map(STATIC_SECURITY_HEADERS.map((h) => [h.key, h.value]));

  it("sets HSTS with a long max-age and subdomains", () => {
    const hsts = byKey.get("Strict-Transport-Security");
    expect(hsts).toBeDefined();
    expect(hsts).toContain("includeSubDomains");
    const maxAge = Number(/max-age=(\d+)/.exec(hsts!)?.[1]);
    expect(maxAge).toBeGreaterThanOrEqual(31536000);
  });

  it("blocks MIME sniffing — an uploaded X-ray must never be executed as script", () => {
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("refuses framing", () => {
    expect(byKey.get("X-Frame-Options")).toBe("DENY");
  });

  it("never leaks a clinical URL path to another origin", () => {
    // Clinical paths embed patient and treatment UUIDs, so a policy that sends
    // the full URL cross-origin would disclose record identifiers in a header.
    const policy = byKey.get("Referrer-Policy");
    expect(["strict-origin-when-cross-origin", "strict-origin", "no-referrer"]).toContain(
      policy
    );
  });

  it("denies device permissions OraMedha never asks for", () => {
    const permissions = byKey.get("Permissions-Policy") ?? "";
    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
      expect(permissions).toContain(`${feature}=()`);
    }
  });
});

describe("CSP mode", () => {
  it("is report-only unless a deployment explicitly opts in to enforcement", () => {
    delete process.env.CSP_MODE;
    expect(cspMode()).toBe("report-only");
    expect(cspHeaderName()).toBe("Content-Security-Policy-Report-Only");

    process.env.CSP_MODE = "something-else";
    expect(cspMode()).toBe("report-only");
  });

  it("enforces when asked", () => {
    process.env.CSP_MODE = "enforce";
    expect(cspMode()).toBe("enforce");
    expect(cspHeaderName()).toBe("Content-Security-Policy");
  });
});

describe("nonce", () => {
  it("is unique per call and long enough to be unguessable", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateNonce()));
    expect(seen.size).toBe(200);
    for (const nonce of seen) expect(nonce.length).toBeGreaterThanOrEqual(16);
  });
});

describe("buildCsp", () => {
  const nonce = "TESTNONCE123456";

  it("does not allow inline scripts — the nonce is the whole point", () => {
    const script = directives(buildCsp(nonce)).get("script-src")!;
    expect(script).toContain(`'nonce-${nonce}'`);
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("stops the page being framed and stops it framing arbitrary origins", () => {
    const d = directives(buildCsp(nonce));
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect(d.get("object-src")).toEqual(["'none'"]);
    expect(d.get("base-uri")).toEqual(["'self'"]);
    expect(d.get("form-action")).toEqual(["'self'"]);
  });

  it("permits exactly the sources real features need", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    const d = directives(buildCsp(nonce));

    // Signed X-ray/consent URLs, PNG data-URL signatures, generated previews.
    expect(d.get("img-src")).toEqual(
      expect.arrayContaining(["'self'", "data:", "blob:", "https://project.supabase.co"])
    );
    // ConsentActions prints through a hidden blob: iframe.
    expect(d.get("frame-src")).toEqual(expect.arrayContaining(["blob:"]));
    // REST/Auth plus the Realtime websocket that drives the live queue.
    expect(d.get("connect-src")).toEqual(
      expect.arrayContaining([
        "'self'",
        "https://project.supabase.co",
        "wss://project.supabase.co",
      ])
    );
  });

  it("names the configured Supabase project rather than wildcarding every host", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    const csp = buildCsp(nonce);
    expect(csp).not.toContain("*.supabase.co");
    expect(csp).not.toContain("connect-src 'self' *");
  });

  it("degrades safely when the Supabase URL is missing rather than emitting a broken directive", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const d = directives(buildCsp(nonce));
    expect(d.get("connect-src")).toEqual(["'self'"]);
  });

  it("ignores an unparseable Supabase URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not a url";
    const d = directives(buildCsp(nonce));
    expect(d.get("connect-src")).toEqual(["'self'"]);
  });
});
