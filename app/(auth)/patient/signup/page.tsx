import type { Metadata } from "next";
import { PatientSignupForm } from "./PatientSignupForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "Activate Patient Account",
  description: "Activate your OraMedha patient portal account.",
};

/**
 * /patient/signup — portal ACTIVATION, not registration.
 *
 * The name of the route is now slightly wrong and is kept anyway: it is linked
 * from /patient/login, from the legacy /signup alias, and quite possibly from a
 * clinic's own printed material. Renaming it would break those for a cosmetic
 * gain.
 *
 * What changed underneath is the model. This was the ONLY page in OraMedha that
 * asked which clinic you belong to, because a self-registering patient had no
 * record for the server to read one from. Patients no longer self-register: a
 * clinic creates the record and puts an email on it, and that email is the only
 * thing that opens portal access — to that clinic and no other.
 *
 * So `getClinics()` is gone from this page, and with it the last place a
 * visitor could assert anything about tenancy. The copy leads with the email
 * requirement because someone whose clinic has not added their address cannot
 * proceed, and should learn that here rather than after typing a password.
 */
export default function PatientSignupPage() {
  return (
    <AuthShell
      tone="patient"
      eyebrow="Patient portal"
      headline="Activate your account."
      subhead="Your clinic sets up your record. Enter the email address they have on file and we'll send you a code."
      points={[
        "Book and manage appointments online",
        "Follow your place in the queue on the day",
        "Keep every bill and record in one place",
      ]}
      formTitle="Activate your account"
      formSubtitle="Three steps: email, code, password."
      footer={
        <>
          Already activated?{" "}
          <a
            href="/patient/login"
            className="rounded font-medium text-accent underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Sign in instead
          </a>
        </>
      }
    >
      <PatientSignupForm />
    </AuthShell>
  );
}
