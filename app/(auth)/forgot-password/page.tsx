import type { Metadata } from "next";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Request a password reset link for your OraMedha patient account.",
};

/**
 * /forgot-password
 *
 * Part of the PATIENT auth experience — self-service reset is patient-only
 * (actions/auth.ts:isPasswordResetEligible), so this page wears the patient
 * tone and links back to the patient sign-in, not the staff one.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthShell
      tone="patient"
      eyebrow="Account recovery"
      headline="Let's get you back in."
      subhead="We'll email you a secure link. It expires shortly after it's sent, so use it soon."
      formTitle="Reset your password"
      formSubtitle="Enter the email address you use for the patient portal."
      footer={
        <>
          Remembered it?{" "}
          <a
            href="/patient/login"
            className="rounded font-medium text-accent underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Back to sign in
          </a>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
