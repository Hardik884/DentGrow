/**
 * lib/auth/verification.ts — shared logic for the email-verification step.
 *
 * WHY THIS IS ITS OWN MODULE
 *   The cooldown is needed in two places: the server component computes how
 *   much of the window is left when the page renders, and the client panel
 *   counts the rest of it down. It cannot live in the panel.
 *
 *   Every export of a `"use client"` module is replaced, on the server, by an
 *   opaque client REFERENCE — including plain constants. So a Server Component
 *   importing a number from a client file gets an object, and arithmetic on it
 *   silently produces NaN rather than throwing. TypeScript cannot see it,
 *   because the types are erased and the shape it checks is the real one.
 *
 *   Keeping the value in a neutral module means both sides get the number.
 */

/**
 * Seconds a patient must wait between confirmation emails.
 *
 * NAMING: "resend" here is the verb — sending the confirmation again — and has
 * nothing to do with Resend the email vendor. The two are unrelated, and this
 * constant applies whichever transport is carrying the mail.
 *
 * Matched to Supabase's `auth.email.max_frequency` — 60s in
 * supabase/config.toml and on the hosted project (set by
 * scripts/push-auth-email-config.mjs) — rather than picked for feel. Supabase
 * refuses a send inside that window, so a shorter value here would re-enable
 * the button into a rejection the patient reads as a failure.
 *
 * The window is counted from the LAST send, which for a patient who has just
 * registered is the one signup itself triggered — not their first click.
 */
export const RESEND_COOLDOWN_SECONDS = 60;

// ── Interpreting a failed send ───────────────────────────────────────────────

/**
 * What went wrong when Supabase Auth could not send a verification email.
 *
 *   throttled       Asked again too soon, or the project's hourly cap is spent.
 *                   Recoverable by waiting; `retryAfterSeconds` says how long
 *                   when Supabase told us.
 *   not_authorized  The mail transport refused this RECIPIENT. In practice this
 *                   means the project is on Supabase's built-in email service,
 *                   which delivers only to addresses on the project's team.
 *                   Waiting will never fix it.
 *   unknown         Anything else — treat as transient.
 */
export type EmailSendFailure = {
  kind: "throttled" | "not_authorized" | "unknown";
  /** Seconds Supabase asked us to wait, when it named a number. */
  retryAfterSeconds: number | null;
  /** Plain-language line safe to render to a patient. */
  message: string;
};

/**
 * Classify a Supabase Auth send failure and phrase it for a human.
 *
 * Raw provider wording never reaches the screen (CLAUDE.md §13.1) — "For
 * security purposes, you can only request this after 47 seconds" is Supabase
 * explaining itself to a developer, and "Email address not authorized" reads,
 * to a patient, as an accusation about their own address.
 *
 * The wait is quoted back when Supabase names one, because the honest number
 * varies by more than the copy could otherwise admit: the per-user gap is a
 * minute, but the built-in service's project-wide cap of two messages an hour
 * can push the real answer out to most of an hour, and "please wait a minute"
 * would then be a lie the patient discovers by trying.
 */
export function describeEmailSendFailure(raw: string | undefined): EmailSendFailure {
  const message = (raw ?? "").toLowerCase();

  // Supabase's built-in service refusing a non-team recipient. Deliberately
  // matched before throttling: it is not a wait, and telling someone to try
  // again later would send them round a loop that cannot end.
  if (
    message.includes("not authorized") ||
    message.includes("email_address_not_authorized") ||
    message.includes("email address not authorized")
  ) {
    return {
      kind: "not_authorized",
      retryAfterSeconds: null,
      message:
        "We couldn't send a verification email to that address. Please contact your clinic so they can set up your account.",
    };
  }

  if (
    message.includes("rate limit") ||
    message.includes("too many") ||
    message.includes("security purposes") ||
    message.includes("for security") ||
    message.includes("over_email_send_rate_limit")
  ) {
    const seconds = Number(/after (\d+) seconds?/.exec(message)?.[1] ?? NaN);
    const retryAfterSeconds = Number.isFinite(seconds) ? seconds : null;

    return {
      kind: "throttled",
      retryAfterSeconds,
      message:
        retryAfterSeconds === null
          ? "We've sent one recently. Please wait a little while and try again."
          : `We've sent one recently. Please try again in ${describeWait(retryAfterSeconds)}.`,
    };
  }

  return {
    kind: "unknown",
    retryAfterSeconds: null,
    message: "We couldn't send the email just now. Please try again shortly.",
  };
}

/**
 * A wait a person would say out loud, not a raw second count.
 *
 * Rounds UP into minutes. Over-quoting by a few seconds costs nothing;
 * under-quoting sends someone back to a button that refuses them again, which
 * is the exact experience this whole classification exists to prevent.
 */
function describeWait(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}
