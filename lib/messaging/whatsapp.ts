/**
 * lib/messaging/whatsapp.ts
 *
 * Pure helpers for the human-in-the-loop WhatsApp path.
 *
 * DentGrow never sends anything itself. It prepares a message, fills it with the
 * patient's real details, and hands the staff member a wa.me link that opens
 * WhatsApp with the message pre-typed to that one patient. The human reviews it
 * and presses send. These helpers are the plumbing for that and nothing more —
 * no network, no I/O, no dependency on the messaging engine's side.
 */

/**
 * Default country code, applied to numbers stored without one. India (+91),
 * matching the clinic default timezone (Asia/Kolkata). `patients.phone` is
 * free text with no guaranteed country code, so this is a best-effort default;
 * the staff member sees the resulting number and can correct it before sending.
 */
export const DEFAULT_COUNTRY_CODE = "91";

/**
 * Turn a stored phone number into the digits-only form wa.me needs, or null when
 * it cannot be used.
 *
 * Rules, applied after stripping every non-digit and any leading trunk zero:
 *   - 7–10 digits  → a local number; the default country code is prepended.
 *   - 11–15 digits → assumed already international; kept as-is.
 *   - anything else → null (too short to dial, or implausibly long).
 */
export function sanitizeWhatsAppNumber(
  phone: string | null | undefined,
  defaultCc: string = DEFAULT_COUNTRY_CODE,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length >= 7 && digits.length <= 10) return `${defaultCc}${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/**
 * Build a wa.me click-to-send link that opens WhatsApp addressed to the patient
 * with the message pre-filled. Returns null when the number is unusable, so the
 * caller can show a "no phone on file" state instead of a dead link.
 */
export function buildWhatsAppLink(
  phone: string | null | undefined,
  message: string,
): string | null {
  const number = sanitizeWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/**
 * Replace every {{marker}} in a template with the matching value. A marker with
 * no supplied value is left intact rather than blanked, so an unfilled message
 * is visibly wrong (and catchable by hasUnfilledPlaceholders) instead of quietly
 * reading "...balance of  for treatment...".
 */
export function fillTemplate(body: string, vars: Readonly<Record<string, string>>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : whole,
  );
}

/** True if any {{marker}} was left unfilled — used to guard before sending. */
export function hasUnfilledPlaceholders(text: string): boolean {
  return /\{\{\w+\}\}/.test(text);
}
