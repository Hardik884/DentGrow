/**
 * lib/whatsapp/phone.ts
 *
 * Normalizes a patient's stored `phone` into the digits-only, country-coded
 * format WhatsApp's click-to-chat deep link (`https://wa.me/<digits>`)
 * requires, and builds that link.
 *
 * DentGrow stores `patients.phone` as free text (CLAUDE.md 5.1: "Phone number
 * must be validated for format before save", not normalized into a fixed
 * shape), so clinic data includes bare 10-digit Indian numbers, numbers with
 * a leading 0, and numbers already carrying +91 or 91. This module accepts
 * all of those and rejects anything that doesn't resolve to a plausible
 * number, so the caller never opens a broken wa.me link.
 */

export type PhoneNormalizationResult =
  | { ok: true; digits: string }
  | { ok: false; reason: "missing" | "invalid" };

/**
 * Normalize a phone number for WhatsApp's wa.me deep link.
 *
 * Rules (India-first, per DentGrow's primary market):
 *   - Strips everything but digits and a leading "+".
 *   - A bare 10-digit number is assumed Indian and gets "91" prepended.
 *   - An 11-digit number starting with "0" has the leading 0 dropped, then
 *     the 10-digit rule applies.
 *   - A number already starting with "91" and 12 digits total is used as-is.
 *   - Any other already-international number (11–15 digits, optional leading
 *     "+") is passed through digits-only — DentGrow clinics are not assumed
 *     to be exclusively Indian-numbered.
 *   - Anything that doesn't resolve to 10–15 digits is rejected rather than
 *     guessed at, so a malformed number never produces a broken wa.me link.
 */
export function normalizeIndianWhatsAppNumber(
  raw: string | null | undefined
): PhoneNormalizationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "missing" };
  }

  const cleaned = raw.trim().replace(/[^\d+]/g, "");
  let digits = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;

  if (digits.length === 0) return { ok: false, reason: "invalid" };

  // 11 digits starting with a trunk-prefix 0 → drop it, then re-check length.
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  // Bare 10-digit Indian mobile/landline → assume +91.
  if (digits.length === 10) {
    digits = `91${digits}`;
  }

  // Plausible international number: 10–15 digits total (ITU E.164 max is 15).
  if (!/^\d{10,15}$/.test(digits)) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, digits };
}

/** Build a WhatsApp click-to-chat URL with a pre-filled (never auto-sent) message. */
export function buildWhatsAppShareUrl(digits: string, message: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
