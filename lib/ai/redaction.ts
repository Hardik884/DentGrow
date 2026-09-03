/**
 * lib/ai/redaction.ts
 *
 * The boundary between OraMedha's data and a third-party AI provider.
 *
 * WHY IT EXISTS
 *   Every AI feature in this product is a convenience. None of them is worth
 *   sending a named patient's clinical and financial position to a service the
 *   clinic has no contract with. The Business Brain prompt already proved the
 *   pattern works — it sends pre-computed facts and no identifier of any kind,
 *   and it is the most useful AI surface in the product. This module makes that
 *   the rule rather than the exception.
 *
 * THE RULE
 *   A prompt may contain what the model needs to do the task, and nothing that
 *   identifies whose task it is. In practice:
 *
 *     - No name. The model is told "the patient"; the reader already knows who
 *       they are looking at, because they opened that patient's record.
 *     - No phone number, email or address for a patient. A model writing a
 *       clinical summary has no use for a way to contact someone.
 *     - No free-text the patient did not intend for this purpose.
 *     - Dates coarsened where precision is not needed: a date of birth becomes
 *       an age band, because "34" is a fact about a cohort and "1992-03-14" is
 *       a re-identification key.
 *
 * WHAT THIS DOES NOT CLAIM
 *   Pseudonymised is not anonymous. A treatment history is distinctive, and a
 *   determined party holding other data could sometimes re-identify a patient
 *   from it. This reduces exposure; it does not eliminate it, and it is not a
 *   substitute for a processing agreement with the provider. See
 *   docs/AI-DATA-HANDLING.md, which states plainly what is and is not settled.
 */

/**
 * The label a prompt uses instead of a patient's name.
 *
 * Constant rather than derived from the patient id: a stable per-patient
 * pseudonym would be a consistent identifier across every request, which is
 * exactly the thing that lets an observer link separate prompts back into one
 * person's history. One conversation concerns one patient, so it needs no
 * identifier at all.
 */
export const PATIENT_PSEUDONYM = "the patient";

/** Ten-year bands. Wide enough not to single anyone out, narrow enough to matter clinically. */
export function ageBand(age: number | null | undefined): string {
  if (age === null || age === undefined || !Number.isFinite(age)) return "unknown";
  if (age < 0) return "unknown";
  if (age < 13) return "under 13";
  if (age >= 80) return "80 or older";
  const decade = Math.floor(age / 10) * 10;
  return `${decade}-${decade + 9}`;
}

/**
 * Coarsens a timestamp to a month.
 *
 * "last seen in March 2026" carries the clinical meaning of a last-visit date
 * — how long it has been — without the exact day, which in combination with a
 * clinic's public appointment pattern is closer to an identifier than it looks.
 */
export function coarsenToMonth(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Patterns that must never appear in an outbound prompt.
 *
 * Two different failures are caught here, and they are worth naming separately:
 *
 *   1. IDENTIFIERS. An Indian mobile number or an email address in a prompt
 *      means a call site is passing a raw record where it should be passing a
 *      minimised one.
 *
 *   2. SECRETS. A prompt is assembled by string interpolation, and string
 *      interpolation is how an environment variable ends up somewhere it was
 *      never meant to go. A Supabase service key, a JWT or a Google API key in
 *      a prompt would be handed to a third party in plaintext and logged on
 *      their side. This is cheap to check and catastrophic to miss.
 */
type RuleClass = "secret" | "identifier";

/**
 * A `secret` rule can never be waived. An `identifier` rule can, by a call site
 * that names it explicitly — the clinic's own published phone number and email
 * belong in the patient assistant's prompt, because answering "what is the
 * clinic's number" is one of the things that assistant is for. A PATIENT's
 * phone number never does, and no waiver exists that would let one through
 * without the call site saying so in writing.
 */
const FORBIDDEN_PATTERNS: ReadonlyArray<{
  name: string;
  cls: RuleClass;
  pattern: RegExp;
}> = [
  // Google API keys: the literal shape of GOOGLE_AI_API_KEY.
  { name: "google-api-key", cls: "secret", pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  // Any JWT — Supabase anon and service-role keys are JWTs, as are user tokens.
  {
    name: "jwt",
    cls: "secret",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  // Supabase's newer publishable/secret key format.
  { name: "supabase-key", cls: "secret", pattern: /\bsb_(secret|publishable)_[A-Za-z0-9_-]{8,}\b/ },
  // A personal access token for the Supabase Management API.
  { name: "supabase-access-token", cls: "secret", pattern: /\bsbp_[a-f0-9]{40,}\b/ },
  // Resend API key.
  { name: "resend-key", cls: "secret", pattern: /\bre_[A-Za-z0-9_-]{16,}\b/ },
  // An email address. No AI feature in this product needs one.
  {
    name: "email-address",
    cls: "identifier",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  },
  // An Indian mobile number, with or without the country code. Deliberately
  // narrow: a bare 10-digit run also matches money and record counts, and a
  // check that cries wolf gets deleted.
  { name: "phone-number", cls: "identifier", pattern: /(?:\+91[\s-]?|\b0)?[6-9]\d{9}\b/ },
];

export class PromptSafetyError extends Error {
  constructor(public readonly violation: string) {
    super(`Prompt withheld: contains ${violation}`);
    this.name = "PromptSafetyError";
  }
}

/**
 * Returns the name of the first forbidden pattern found, or null.
 *
 * Exported separately from the throwing version so tests can assert WHICH rule
 * fired, and so a caller that wants to log rather than fail can.
 */
export type WaivableRule = "email-address" | "phone-number";

export function findForbiddenContent(
  prompt: string,
  waived: readonly WaivableRule[] = []
): string | null {
  for (const { name, cls, pattern } of FORBIDDEN_PATTERNS) {
    // A secret is never waivable, whatever the call site passes.
    if (cls === "identifier" && waived.includes(name as WaivableRule)) continue;
    if (pattern.test(prompt)) return name;
  }
  return null;
}

/**
 * Last line of defence before a prompt leaves the building.
 *
 * Called by the provider wrapper, so it applies to EVERY outbound prompt
 * including ones added later by someone who has not read this file. It throws
 * rather than redacting: silently rewriting a prompt would hide the bug that
 * produced it, and every AI feature already degrades gracefully when a call
 * fails (CLAUDE.md §13.11), so the cost of throwing is one missing summary.
 */
export function assertPromptIsSafe(
  prompt: string,
  waived: readonly WaivableRule[] = []
): void {
  const violation = findForbiddenContent(prompt, waived);
  if (violation) throw new PromptSafetyError(violation);
}
