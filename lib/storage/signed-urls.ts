/**
 * lib/storage/signed-urls.ts
 *
 * How long a link to a patient's stored document stays live.
 *
 * WHY THIS IS A SHARED CONSTANT AND NOT A LITERAL AT EACH CALL SITE
 *   A signed Supabase Storage URL is a BEARER TOKEN in a query string. Anyone
 *   who receives it can fetch the object — no session, no role, no clinic
 *   check, because the signature already carries the authorisation. Whatever
 *   number is passed to createSignedUrl is therefore the window in which a
 *   radiograph pasted into a chat, attached to a support ticket, or caught in a
 *   shared screenshot is readable by whoever received it.
 *
 *   Every call site used `60 * 60` — one hour. That is a long time for a URL
 *   whose only protection is that nobody has forwarded it yet.
 *
 * WHY FIVE MINUTES
 *   The link only has to survive the round trip from the server rendering the
 *   page to the browser loading the image or opening the PDF, plus a little
 *   room for a slow connection and a user who pauses before clicking. Five
 *   minutes covers that comfortably and leaves nothing useful behind
 *   afterwards. Re-rendering the page mints a fresh URL, so nothing in the
 *   product depends on the old one still working.
 *
 *   The one case worth naming: a very large PDF on a poor connection could in
 *   principle outlive the URL mid-download. Supabase validates the signature
 *   when the request STARTS, so a transfer already in flight is unaffected;
 *   only a click made more than five minutes after the page rendered has to be
 *   retried by reloading.
 */

/** Lifetime, in seconds, of a signed URL for a patient document or X-ray. */
export const DOCUMENT_URL_TTL_SECONDS = 300;

/**
 * Lifetime, in seconds, of a signed URL for a signed consent document.
 *
 * Same reasoning, same number — kept as a separate export because the two
 * buckets hold different things and a future decision to shorten one should
 * not silently shorten the other.
 */
export const CONSENT_URL_TTL_SECONDS = 300;
