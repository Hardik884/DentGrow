import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { getSignupEmailState } from "@/lib/clinic-session";
import { maskEmail } from "@/lib/auth/email-mask";
import { RESEND_COOLDOWN_SECONDS } from "@/lib/auth/verification";
import { VerifyEmailPanel } from "./VerifyEmailPanel";

export const metadata: Metadata = {
  title: "Check Your Email",
  description: "Confirm your email address to finish creating your OraMedha account.",
  // A page reachable only mid-signup, with a pending address on it. Nothing
  // here should ever appear in a search result.
  robots: { index: false, follow: false },
};

/**
 * /patient/verify-email — the step between creating an account and using it.
 *
 * WHY IT EXISTS
 *   With email confirmation on, `signUp` returns no session: the account is
 *   real but unusable until the link in the inbox is clicked. Sending someone
 *   to /portal/setup at that moment produces a page that cannot do anything and
 *   does not say why. This screen is the honest version of that moment — it
 *   names the one thing that has to happen next, and gives the two ways it can
 *   go wrong (wrong address, email never arrived) their own buttons.
 *
 * WHAT IT IS NOT
 *   It is not a verification mechanism. Nothing on this page mints, stores or
 *   checks a token. The link in the email is Supabase's, verified by
 *   /auth/callback; "Resend email" is Supabase's own `auth.resend`. This page
 *   is a waiting room with the exits labelled.
 *
 * TONE
 *   The mint `patient` canvas, same as /patient/login and /patient/signup, so
 *   the three steps of registering read as one continuous flow rather than as a
 *   detour into a system page.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [pending, { error }] = await Promise.all([getSignupEmailState(), searchParams]);

  // No pending signup — there is nothing to wait for and nothing to resend.
  // Send them to the sign-in page rather than showing an empty waiting room.
  if (!pending) redirect("/patient/login");

  // Signup has ALREADY sent one confirmation, and Supabase counts its throttle
  // window from that send. So the resend button opens mid-countdown rather than
  // enabled-and-doomed: offering a click that is certain to be refused for the
  // next minute turns a working system into an apparent failure.
  const elapsed = pending.sentAt ? (Date.now() - pending.sentAt) / 1000 : Infinity;
  const secondsUntilResend = Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed));

  return (
    <AuthShell
      tone="patient"
      eyebrow="One step left"
      headline="Just confirming it's you."
      subhead="We've sent a link to the address you signed up with. Opening it proves the inbox is yours and finishes setting up your account."
      points={[
        "The link works on any device — phone or laptop",
        "It can be used once, and then it's spent",
        "Nothing is set up until you open it",
      ]}
      formTitle="Check your email"
      formSubtitle="We've sent you a verification link."
      footer={
        <p>
          Already confirmed?{" "}
          <a
            href="/patient/login"
            className="rounded font-medium text-accent underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Sign in
          </a>
        </p>
      }
    >
      {/* Only the masked form crosses to the client. The full address stays in
          the httpOnly cookie, where the resend action reads it server-side. */}
      <VerifyEmailPanel
        maskedEmail={maskEmail(pending.email)}
        linkFailed={error === "link"}
        initialCooldownSeconds={secondsUntilResend}
      />
    </AuthShell>
  );
}
