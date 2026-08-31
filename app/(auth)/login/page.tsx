import type { Metadata } from "next";
import { StaffLoginForm } from "./StaffLoginForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "Clinic Sign In",
  description: "Sign in to OraMedha to manage your clinic.",
};

/**
 * /login — the clinic sign-in.
 *
 * For dentists and receptionists only. Patients have their own door at
 * /patient/login, and the platform admin has its own at /admin/login; neither
 * is advertised here. There is deliberately no link to the admin page anywhere
 * in the product — and its absence is a UI decision, not the security control.
 * signInAdmin verifies the admin flag on the server regardless of how the page
 * was reached.
 */
export default function LoginPage() {
  return (
    <AuthShell
      tone="staff"
      eyebrow="Clinic sign-in"
      headline="Built to run your clinic, not just record it."
      subhead="Every screen exists to move something forward — check a patient in, advance the queue, close out a payment — in one tap, updating live for everyone on shift."
      points={[
        "One tap moves the queue for the whole front desk",
        "Treatments, balances and history closed out in place",
        "No forms to hunt for — just the next action",
      ]}
      formTitle="Welcome back"
      formSubtitle="Sign in to your clinic workspace."
      footer={
        <>
          Are you a patient?{" "}
          <a
            href="/patient/login"
            className="rounded font-medium text-accent underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Go to the patient portal
          </a>
        </>
      }
    >
      <StaffLoginForm />
    </AuthShell>
  );
}
