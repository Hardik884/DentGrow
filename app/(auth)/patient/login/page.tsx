import type { Metadata } from "next";
import { PatientLoginForm } from "./PatientLoginForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "Patient Sign In",
  description: "Sign in to your DentGrow patient portal.",
};

/**
 * /patient/login — the patient portal door.
 *
 * Related to the staff page by layout and type, but softer in tone: a mint
 * canvas instead of the deep emerald one, reassurance instead of capability.
 * Someone arriving here is checking on their own care, not running a clinic,
 * and the page should feel like that within a second of loading.
 */
export default async function PatientLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;

  return (
    <AuthShell
      tone="patient"
      eyebrow="Patient portal"
      headline="Your dental care, all in one place."
      subhead="See your upcoming visits, your place in today's queue, and everything your clinic has done for you."
      points={[
        "Appointments and live queue position",
        "Treatment history and prescriptions",
        "Bills, payments and what's outstanding",
      ]}
      formTitle="Welcome back"
      formSubtitle="Sign in to see your appointments and records."
      footer={
        <div className="space-y-2">
          <p>
            New here?{" "}
            <a
              href="/patient/signup"
              className="rounded font-medium text-accent underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Create an account
            </a>
          </p>
          {/* Reciprocal of the "Are you a patient?" link on /login — a
              dentist or receptionist who lands here by habit (a bookmark, a
              search result) needs a way back that isn't the browser's back
              button. Second line, not appended to the line above: two
              unrelated audiences on one sentence read as one confused
              audience. */}
          <p>
            Clinic staff?{" "}
            <a
              href="/login"
              className="rounded font-medium text-accent underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Go to the clinic sign-in
            </a>
          </p>
        </div>
      }
    >
      <PatientLoginForm resetSuccess={reset === "1"} />
    </AuthShell>
  );
}
