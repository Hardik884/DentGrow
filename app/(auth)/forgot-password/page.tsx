import type { Metadata } from "next";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Request a password reset link for your OraMedha account.",
};

/**
 * /forgot-password
 *
 * ONE recovery entry point for every audience — dentist, receptionist,
 * owner/admin and patient.
 *
 * It was patient-only, and wore the patient tone to match. Self-service reset
 * now covers staff and admin too, so the copy here can no longer name an
 * audience: this page is reached before anyone is authenticated, and the whole
 * point of the enumeration-safe response in requestPasswordReset is that the
 * server does not say which kind of account an address belongs to. Copy that
 * said "your patient portal" would be wrong for a dentist, and copy that
 * branched on a query parameter would be a hint the browser controls.
 *
 * The audience only becomes known AFTER the emailed link is opened, which is
 * why /reset-password — which runs inside the recovery session — is the page
 * that can address someone specifically, and does.
 *
 * The TONE is deliberately left as it was. AuthShell declares exactly three —
 * staff, patient, admin — one per door, and this page now belongs to none of
 * them. Picking "staff" would be as arbitrary for a patient as "patient" is for
 * a dentist, and adding a fourth is a design decision, not a refactor. Keeping
 * the existing value changes nothing visually while the copy above does the
 * work; a neutral recovery panel would be the better answer and is left open.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthShell
      tone="patient"
      eyebrow="Account recovery"
      headline="Let's get you back in."
      subhead="We'll email you a secure link. It expires shortly after it's sent, so use it soon."
      formTitle="Reset your password"
      formSubtitle="Enter the email address you sign in with."
      footer={
        <>
          Remembered it?{" "}
          <a
            href="/login"
            className="rounded font-medium text-accent underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Staff sign in
          </a>{" "}
          &middot;{" "}
          <a
            href="/patient/login"
            className="rounded font-medium text-accent underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Patient sign in
          </a>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
