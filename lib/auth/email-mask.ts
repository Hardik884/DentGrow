/**
 * lib/auth/email-mask.ts
 *
 * Renders an email address for the "check your email" screen.
 *
 * The screen has one job: let someone confirm they typed the right address
 * without printing the address in full on a shared or over-the-shoulder
 * screen. So the two parts that actually catch a typo survive — the first
 * character and the whole domain — and everything between them is replaced.
 *
 *   hardik@gmail.com   →  h••••@gmail.com
 *   a@clinic.in        →  a••••@clinic.in
 *
 * The run of bullets is a FIXED length, never the length of what it hides.
 * A length-preserving mask quietly publishes how long the local part is, which
 * is a free hint to anyone guessing at the address, and it buys nothing: the
 * person reading already knows what they typed.
 */

/** How many bullets stand in for the hidden part. Deliberately not variable. */
const MASK = "••••";

/**
 * Mask an email for display. Returns null when there is nothing sensible to
 * show, so callers can fall back to generic copy ("the address you entered")
 * rather than rendering a broken string.
 */
export function maskEmail(email: string | null | undefined): string | null {
  const value = (email ?? "").trim();
  if (!value) return null;

  const at = value.lastIndexOf("@");

  // No domain to anchor on — show nothing rather than a half-masked fragment.
  if (at < 1 || at === value.length - 1) return null;

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);

  // A domain with no dot isn't an address a patient could have received mail
  // at; treat it the same as a missing one.
  if (!domain.includes(".")) return null;

  return `${local[0]}${MASK}@${domain}`;
}
