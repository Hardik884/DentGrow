"use client";

import { useActionState, useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { resendVerificationEmail, abandonSignupEmail } from "@/actions/auth";
import { AuthAlert, AuthNotice } from "@/components/auth/AuthFields";
import { Button } from "@/components/ui/button";
import { RESEND_COOLDOWN_SECONDS } from "@/lib/auth/verification";
import type { ActionResult } from "@/types";

const initialState: ActionResult<{ sent: true }> = { data: null, error: null };

/**
 * VerifyEmailPanel — the body of /patient/verify-email.
 *
 * WHAT THE SCREEN HAS TO SAY
 *   Three things, in this order, because that is the order the questions
 *   arrive in: the email has been sent; here is the address it went to (masked
 *   enough to be safe on a shared screen, precise enough to catch a typo); and
 *   here is what to do if it hasn't turned up or the address is wrong.
 *
 * WHY THE BUTTONS ARE QUIET
 *   The action that actually finishes this flow is in the patient's inbox, not
 *   on this page. A big glass primary button here — the one the sign-in forms
 *   use — would draw the eye to the wrong place and imply that clicking it is
 *   how you get verified. So the destination panel is the loudest element, and
 *   the two recovery paths sit under it as a matched, understated pair.
 *
 * FEEDBACK
 *   Every outcome is announced, not just coloured: AuthNotice carries
 *   role="status" and AuthAlert role="alert", so a screen reader hears "sent"
 *   or the reason it wasn't. Raw Supabase or Resend wording never reaches the
 *   screen — the action collapses it to plain language first.
 */
export function VerifyEmailPanel({
  maskedEmail,
  linkFailed = false,
  initialCooldownSeconds = 0,
}: {
  maskedEmail: string | null;
  /** Arrived here from /auth/callback because the link was spent or expired. */
  linkFailed?: boolean;
  /**
   * Seconds still left on Supabase's throttle when the page rendered, measured
   * from the confirmation signup already sent. Starting at 0 would show an
   * enabled button that Supabase refuses for the next minute.
   */
  initialCooldownSeconds?: number;
}) {
  const [state, formAction, isPending] = useActionState(
    resendVerificationEmail,
    initialState
  );
  const [secondsLeft, setSecondsLeft] = useState(initialCooldownSeconds);

  // Start the lock when a send actually succeeds. Keyed on the state object
  // rather than a boolean so a second successful send restarts the countdown.
  useEffect(() => {
    if (state.data?.sent) setSecondsLeft(RESEND_COOLDOWN_SECONDS);
  }, [state]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  const locked = secondsLeft > 0;

  return (
    <div className="space-y-6">
      {/* An expired or already-used link. Shown until the patient acts, then
          replaced by whatever the resend attempt reported — one banner at a
          time, so the newest outcome is never buried under the old one. */}
      {linkFailed && !state.error && !state.data && (
        <AuthAlert>
          That link has expired or has already been used. Send yourself a fresh
          one below.
        </AuthAlert>
      )}

      {state.error && <AuthAlert>{state.error}</AuthAlert>}
      {state.data?.sent && (
        <AuthNotice>
          Verification email sent. It can take a minute to arrive.
        </AuthNotice>
      )}

      {/* ── Where it went ──────────────────────────────────────────────────
          The anchor of the page. Bordered and tinted so it reads as a fact
          being reported back, not as another form field. */}
      <div className="rounded-xl border border-accent-border bg-accent-subtle-bg p-5">
        <div className="flex items-start gap-3.5">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent"
            aria-hidden="true"
          >
            <MailCheck className="h-5 w-5" />
          </span>

          <div className="min-w-0 space-y-1">
            <p className="text-[13px] font-medium text-text-body">
              Verification link sent to
            </p>
            {maskedEmail ? (
              // break-all so a long address wraps inside the panel instead of
              // pushing the card wide at 320px.
              <p className="break-all text-[15px] font-semibold leading-snug text-text-primary">
                {maskedEmail}
              </p>
            ) : (
              <p className="text-[15px] font-semibold leading-snug text-text-primary">
                the address you signed up with
              </p>
            )}
          </div>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-text-body">
          Open the link in that email to confirm your address. Once you do,
          we&apos;ll take you straight on to setting up your patient account.
        </p>
      </div>

      <p className="text-[13px] leading-relaxed text-text-body">
        Nothing yet? It can take a minute, and it sometimes lands in spam or
        promotions.
      </p>

      {/* ── The two ways out ───────────────────────────────────────────────
          Stacked on a phone so each keeps a full-width, comfortably tappable
          target; side by side from 380px up, where they fit without cramping. */}
      <div className="flex flex-col gap-3 min-[380px]:flex-row">
        <form action={formAction} className="min-[380px]:flex-1">
          <Button
            type="submit"
            variant="outline"
            size="lg"
            isLoading={isPending}
            disabled={isPending || locked}
            className="h-11 w-full rounded-[10px] text-[15px]"
          >
            {isPending
              ? "Sending…"
              : locked
                ? `Resend in ${secondsLeft}s`
                : "Resend email"}
          </Button>
        </form>

        <form action={abandonSignupEmail} className="min-[380px]:flex-1">
          {/* Same variant as its neighbour on purpose. A ghost button here read
              as the louder of the two: while resend is disabled and faded, the
              only full-contrast label on the row would be the one that throws
              the signup away. Two identical outlines put them at the same
              weight, which is what they are — two ways to recover, neither the
              thing the patient is actually meant to do next. */}
          <Button
            type="submit"
            variant="outline"
            size="lg"
            className="h-11 w-full rounded-[10px] text-[15px]"
          >
            Change email
          </Button>
        </form>
      </div>

      {/* A disabled control is skipped by most screen readers, so the reason it
          is disabled is announced separately.

          Deliberately NOT the live countdown: a polite region that changes
          every second interrupts continuously and drowns out everything else on
          the page. This announces the two moments that matter — the lock going
          on, and coming off — and says nothing in between. */}
      <p aria-live="polite" className="sr-only">
        {locked
          ? "An email has just been sent. You can request another in about a minute."
          : "You can request another verification email."}
      </p>
    </div>
  );
}
