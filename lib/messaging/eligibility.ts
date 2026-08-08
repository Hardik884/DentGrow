/**
 * lib/messaging/eligibility.ts
 *
 * The single place that answers "can we actually WhatsApp this patient?".
 *
 * Before this file, phone-reachability was decided only in the UI (the send row
 * greyed out its button when the number was unusable), so the server-built list
 * and the list a staff member could really send disagreed — a patient with no
 * phone still took up a row and inflated the count. Eligibility now lives here
 * and is applied server-side while the list is built, so the count of reminders
 * equals the number of patients we can genuinely reach.
 *
 * Pure and dependency-light on purpose: no DB, no session, no network. It
 * composes the existing phone helpers so there is exactly one definition of
 * "reachable" for every reminder kind.
 */

import { sanitizeWhatsAppNumber } from "./whatsapp";
import { hasUnfilledPlaceholders } from "./whatsapp";

/**
 * True when a stored phone number can be turned into a usable wa.me number.
 * A patient who fails this is never given a WhatsApp reminder — the underlying
 * clinic problem stays visible on its own screen, reachable by other means.
 */
export function isWhatsAppReachable(phone: string | null | undefined): boolean {
  return sanitizeWhatsAppNumber(phone) !== null;
}

/**
 * True when a filled message is safe to offer: it reaches a real number and has
 * no leftover {{markers}}. This is the guard that stops a broken reminder ("...
 * balance of  for treatment...") from ever being generated.
 */
export function isSendableReminder(
  phone: string | null | undefined,
  message: string,
): boolean {
  return isWhatsAppReachable(phone) && !hasUnfilledPlaceholders(message);
}
