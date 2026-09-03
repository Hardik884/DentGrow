import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { createServerClient } from "@/lib/supabase/server";
import { resolveSession } from "@/lib/auth/session";
import { readMfaStatus } from "@/lib/auth/mfa";
import { MfaChallengeForm } from "./MfaChallengeForm";

export const metadata: Metadata = {
  title: "Two-step verification",
  robots: { index: false, follow: false },
};

/**
 * /mfa — the second step of sign-in.
 *
 * Reached after a correct password on an account that has an authenticator
 * enrolled. The session already exists at this point but holds assurance level
 * aal1, which the middleware treats as not-yet-signed-in for every protected
 * route — so leaving this page does not skip it.
 *
 * Renders in the staff shell, because that is who has factors: portal patients
 * are deliberately out of scope for MFA (see lib/auth/mfa.ts).
 */
export default async function MfaChallengePage() {
  const { user } = await resolveSession();
  if (!user) redirect("/login");

  const supabase = await createServerClient();
  const status = await readMfaStatus(supabase);

  // Already verified, or nothing to verify. Either way this page has no work to
  // do and would otherwise be a dead end with a code box nobody can satisfy.
  if (!status.challengeRequired) redirect("/");

  return (
    <AuthShell
      tone="staff"
      eyebrow="Security"
      headline="One more step."
      subhead="Your account is protected by an authenticator app. Enter the current code to continue."
      formTitle="Two-step verification"
      formSubtitle="Open your authenticator app and enter the 6-digit code."
      // The acknowledgement belongs at the point of sign-in, which has already
      // happened by the time someone reaches this page.
      showLegalNote={false}
    >
      <MfaChallengeForm />
    </AuthShell>
  );
}
