import type { Metadata } from "next";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Set New Password",
  description: "Choose a new password for your OraMedha account.",
};

/**
 * Which sign-in door this recovery session belongs to.
 *
 * Unlike /forgot-password, this page runs INSIDE the short-lived recovery
 * session established by /auth/callback, so the audience is knowable here — and
 * it is read from the profile row, never from a query parameter.
 *
 * Falls back to the patient door when there is no session or no profile: the
 * form itself refuses to submit without a session (updatePassword re-checks),
 * so this only decides which "back to sign in" link is offered on the
 * expired-link screen, where the patient door is the safe default because an
 * account with no profile yet is a patient part-way through signup.
 */
async function signInHref(): Promise<{ href: string; label: string }> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { href: "/patient/login", label: "Back to sign in" };

    const { data } = await supabase
      .from("profiles")
      .select("role, is_admin")
      .eq("id", user.id)
      .maybeSingle();

    const row = (data as { role?: string; is_admin?: boolean } | null) ?? null;
    // No admin branch: resolveResetAudience refuses to send an admin a recovery
    // email at all, so no admin recovery session can reach this page.
    if (row?.role === "dentist" || row?.role === "receptionist") {
      return { href: "/login", label: "Back to staff sign in" };
    }
    return { href: "/patient/login", label: "Back to sign in" };
  } catch {
    // Never let a profile lookup break the page someone is trying to recover on.
    return { href: "/patient/login", label: "Back to sign in" };
  }
}

/**
 * /reset-password
 *
 * Renders inside the short-lived recovery session established by /auth/callback,
 * for every audience: dentist, receptionist, owner/admin and patient.
 *
 * The post-submit redirect is NOT decided here — updatePassword resolves it
 * server-side and returns it, because the audience must be read before the
 * password change signs the session out. This page only picks the "back to
 * sign in" link shown alongside the form.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { href, label } = await signInHref();

  return (
    <AuthShell
      tone="patient"
      eyebrow="Account recovery"
      headline="Almost there."
      subhead="Choose a password you don't use anywhere else, then sign in with it."
      formTitle="Set a new password"
      formSubtitle="This replaces your old password immediately."
      footer={
        <a
          href={href}
          className="rounded font-medium text-accent underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {label}
        </a>
      }
    >
      <ResetPasswordForm linkError={error === "link"} />
    </AuthShell>
  );
}
