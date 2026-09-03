/**
 * lib/security/headers.ts
 *
 * The application's HTTP security headers, in one testable place.
 *
 * SPLIT ACROSS TWO MECHANISMS, DELIBERATELY
 *   - The static headers (HSTS, nosniff, Referrer-Policy, Permissions-Policy,
 *     frame protection) never vary per request, so next.config.ts serves them
 *     for every route including /api and static assets, which middleware does
 *     not match.
 *   - Content-Security-Policy carries a per-request nonce, so it is built here
 *     and applied by middleware.ts.
 *
 * WHY CSP DEFAULTS TO REPORT-ONLY
 *   A CSP that blocks something the app genuinely needs does not degrade — it
 *   breaks the page, silently, in the browser, after deploy. OraMedha renders
 *   Supabase signed URLs as images, prints consent documents through blob:
 *   iframes, and stores handwritten signatures as data: URLs; every one of
 *   those is a directive that has to be right.
 *
 *   So the default mode emits `Content-Security-Policy-Report-Only`: browsers
 *   evaluate the policy and report violations without enforcing it. Once a
 *   deployment has been exercised (sign in, patient profile, X-ray preview,
 *   consent print, portal assistant) with no violations, set CSP_MODE=enforce.
 *
 *   → REQUIRES MANUAL CONFIGURATION: flip CSP_MODE to "enforce" after
 *     verifying a real deployment. Documented in docs/SECURITY.md.
 *
 * The nonce is still issued in report-only mode. Next.js reads the CSP from the
 * REQUEST headers and stamps its own inline bootstrap scripts with the nonce it
 * finds there; without that, every Next-generated script would be reported as a
 * violation and the reports would be noise instead of signal.
 */

export type CspMode = "enforce" | "report-only";

/** Reads the deployment's chosen enforcement mode. Anything unrecognised is report-only. */
export function cspMode(): CspMode {
  return process.env.CSP_MODE === "enforce" ? "enforce" : "report-only";
}

export function cspHeaderName(mode: CspMode = cspMode()): string {
  return mode === "enforce"
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";
}

/**
 * Generates a fresh nonce. Uses Web Crypto, which is what the Edge runtime
 * middleware executes in — node:crypto is not available there.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // btoa over a binary string: base64 without pulling in Buffer, which the Edge
  // runtime does not provide.
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Derives the origins the browser must be allowed to talk to from the Supabase
 * URL the app is actually configured with, rather than a wildcard. Returns both
 * the https origin and its websocket counterpart (Realtime powers the live
 * queue, and a blocked wss: connection would leave the queue silently frozen).
 */
function supabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const { origin, host } = new URL(raw);
    const scheme = origin.startsWith("https") ? "wss" : "ws";
    return [origin, `${scheme}://${host}`];
  } catch {
    return [];
  }
}

/**
 * Builds the Content-Security-Policy value.
 *
 * Each directive below is present because something in the product needs it.
 * Removing one is a decision about a feature, not a tidy-up:
 *
 *   script-src   'strict-dynamic' + nonce is the modern strict form: only
 *                nonced scripts run, and scripts they load inherit trust.
 *                'self' and https: are ignored by browsers that understand
 *                strict-dynamic and act as the fallback for those that do not.
 *   style-src    'unsafe-inline' is unavoidable: Tailwind's runtime-injected
 *                styles and Next's inline <style> blocks are not nonced.
 *                Style injection is a far smaller risk than script injection.
 *   img-src      data: for the PNG data-URL patient signatures stored in
 *                consents; blob: for locally generated previews; the Supabase
 *                origin for signed X-ray and consent URLs.
 *   frame-src    blob: only — ConsentActions prints by loading the fetched
 *                document into a hidden same-origin blob: iframe.
 *   connect-src  the Supabase REST/Auth origin and its Realtime websocket.
 *   worker-src   blob: — jsPDF/html2canvas construct workers this way.
 *   frame-ancestors 'none' — nothing in OraMedha is meant to be embedded, and
 *                this is the directive that actually stops clickjacking
 *                (X-Frame-Options is the legacy companion, set alongside).
 */
export function buildCsp(nonce: string): string {
  const supabase = supabaseOrigins();
  const connect = ["'self'", ...supabase];
  const img = ["'self'", "data:", "blob:", ...supabase.filter((o) => o.startsWith("http"))];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [`'nonce-${nonce}'`, "'strict-dynamic'", "'self'", "https:"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": img,
    "font-src": ["'self'", "data:"],
    "connect-src": connect,
    "frame-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "media-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  const parts = Object.entries(directives).map(
    ([name, values]) => `${name} ${values.join(" ")}`
  );

  // upgrade-insecure-requests has no value. Omitted in development, where the
  // app is served over plain http and the directive would upgrade localhost
  // requests into connections nothing is listening on.
  if (process.env.NODE_ENV === "production") parts.push("upgrade-insecure-requests");

  return parts.join("; ");
}

/**
 * The headers that never vary per request.
 *
 * Strict-Transport-Security is emitted unconditionally rather than only in
 * production: the header is ignored by browsers over plain http, so a local
 * dev server is unaffected, and gating it on NODE_ENV is how it ends up missing
 * from the one environment that needs it.
 */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  // Two years, subdomains included, preload-eligible.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Never let a browser guess that an uploaded "image/png" is really a script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Legacy companion to frame-ancestors 'none'.
  { key: "X-Frame-Options", value: "DENY" },
  // Clinical URLs embed patient and treatment UUIDs. Send the origin and never
  // the path to another site, and nothing at all when leaving https for http.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // OraMedha asks for none of these. Denying them means a compromised script
  // cannot either.
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", "),
  },
  // Cross-origin isolation of this document's own resources.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];
