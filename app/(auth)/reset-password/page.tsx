import type { Metadata } from "next";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "Set New Password",
  description: "Choose a new password for your DentGrow patient account.",
};

/**
 * /reset-password
 *
 * Renders inside the short-lived recovery session established by
 * /auth/callback. Same patient tone as the rest of the recovery flow.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

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
          href="/patient/login"
          className="rounded font-medium text-accent underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Back to sign in
        </a>
      }
    >
      <ResetPasswordForm linkError={error === "link"} />
    </AuthShell>
  );
}
