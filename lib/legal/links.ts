/**
 * lib/legal/links.ts
 *
 * The one place that knows where OraMedha's published legal documents live.
 *
 * WHY THESE ARE NOT PAGES IN THIS APPLICATION
 *   The canonical Privacy Policy is published on the OraMedha marketing site
 *   (repository `Hardik884/OraMedha-Website`, route `/privacy`, served from
 *   https://oramedha.com). It covers BOTH the marketing site and this
 *   application, and it is the document a clinic and a patient are actually
 *   shown. Re-publishing a second copy inside the PMS would create two
 *   documents that drift apart, and the one people were shown at sign-in would
 *   be the copy nobody maintains. So this app links out; it does not host.
 *
 * WHY THE ORIGIN IS CONFIGURABLE
 *   `https://oramedha.com` is the real production origin (it is the
 *   `metadataBase` of the marketing site and the URL in its own OpenGraph
 *   tags), so it is a safe default rather than a placeholder. It stays
 *   overridable because a preview deployment of the marketing site has a
 *   different host, and a broken legal link on a preview is worse than a
 *   configurable one.
 *
 *   NEXT_PUBLIC_ is correct here — unlike the app's own origin (see
 *   lib/app-url.ts), this is a FIXED external domain, so build-time inlining
 *   cannot pick up the wrong value from the build environment.
 *
 * WHY THERE IS NO TERMS URL BY DEFAULT
 *   The marketing site publishes exactly one legal page today: `/privacy`. Its
 *   own footer links only that. There is no Terms of Service document, so this
 *   module refuses to invent a URL for one: `termsUrl()` returns null until
 *   NEXT_PUBLIC_TERMS_URL names a page that actually exists, and the sign-in
 *   footer silently drops the Terms clause while it does. A dead link in a
 *   legal notice is worse than no link.
 *
 *   → REQUIRES LEGAL ACTION: publish Terms of Service on the marketing site,
 *     then set NEXT_PUBLIC_TERMS_URL. See docs/DATA-PROTECTION.md.
 */

/** The marketing site's production origin. Trailing slashes are trimmed. */
const DEFAULT_MARKETING_ORIGIN = "https://oramedha.com";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Accepts only an absolute http(s) origin. Anything else (a relative path, a
 * javascript: URL, an empty string left in the environment) is rejected and the
 * caller falls back, so a misconfigured variable cannot turn a legal link into
 * something that navigates somewhere unexpected.
 */
export function isUsableLegalUrl(value: string | undefined | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Origin of the marketing site that publishes the canonical legal documents. */
export function marketingOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_MARKETING_URL;
  return trimTrailingSlash(
    isUsableLegalUrl(configured) ? configured : DEFAULT_MARKETING_ORIGIN
  );
}

/** The canonical Privacy Policy. Always available. */
export function privacyPolicyUrl(): string {
  return `${marketingOrigin()}/privacy`;
}

/**
 * The Terms of Service, or null while none is published.
 * Callers MUST handle null rather than rendering a dead link.
 */
export function termsUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_TERMS_URL;
  return isUsableLegalUrl(configured) ? trimTrailingSlash(configured) : null;
}
