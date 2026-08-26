import type { Metadata } from "next";
import { PatientSignupForm } from "./PatientSignupForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { getClinics } from "@/actions/clinics";

export const metadata: Metadata = {
  title: "Create Patient Account",
  description: "Create an OraMedha patient portal account.",
};

/**
 * /patient/signup — new patient registration.
 *
 * Visually the sibling of /patient/login (same mint canvas, same rhythm) so
 * moving between them feels like one product. The difference in content is the
 * point: signing in needs nothing but credentials, registering needs a clinic —
 * and this is the only page in OraMedha that asks for one.
 */
export default async function PatientSignupPage() {
  const { data: clinics } = await getClinics();

  return (
    <AuthShell
      tone="patient"
      eyebrow="New patient"
      headline="Welcome to OraMedha."
      subhead="Create your account once, then book visits and follow your treatment from any device."
      points={[
        "Book and manage appointments online",
        "Follow your place in the queue on the day",
        "Keep every bill and record in one place",
      ]}
      formTitle="Create your account"
      formSubtitle="A few details and you're set up."
      footer={
        <>
          Already registered?{" "}
          <a
            href="/patient/login"
            className="rounded font-medium text-accent underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Sign in instead
          </a>
        </>
      }
    >
      <PatientSignupForm clinics={clinics ?? []} />
    </AuthShell>
  );
}
