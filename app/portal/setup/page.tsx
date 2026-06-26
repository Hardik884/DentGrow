import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PortalLinkForm } from "@/components/patient/PortalLinkForm";
import { getClinics } from "@/actions/clinics";
import { getSignupClinic, getSignupPhone, getSelectedClinic } from "@/lib/clinic-session";

export const metadata: Metadata = {
  title: "Account Setup — DentGrow",
};

/**
 * /portal/setup
 * Portal account setup — shown when a user has signed up but has no entry
 * in patient_portal_links.
 *
 * Two paths are supported:
 *
 * A — Existing patient
 *   Enter the phone number registered with the clinic.
 *   The server action finds the matching record and links it.
 *
 * B — New patient (self-registration)
 *   If no record is found for the phone number, the server action prompts for
 *   a name and creates a new patient record automatically.
 *   No manual clinic registration required — patients are never blocked.
 */
export default async function PortalSetupPage() {
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // If already linked, skip setup
  const { data: existingLink } = await db
    .from("patient_portal_links")
    .select("patient_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingLink) redirect("/portal");

  // The clinic chosen at signup is carried via cookie. If present we lock the
  // form to that clinic; otherwise the user must pick one (e.g. they reached
  // setup after confirming email on a new device). The phone is prefilled when
  // it was entered at signup.
  const [{ data: clinics }, signupClinicId, selectedClinicId, signupPhone] =
    await Promise.all([
      getClinics(),
      getSignupClinic(),
      getSelectedClinic(),
      getSignupPhone(),
    ]);

  // Prefer the clinic chosen at signup; fall back to the clinic selected at
  // login (covers users who signed up earlier and are linking after a login).
  const presetClinicId = signupClinicId ?? selectedClinicId ?? undefined;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border p-6 w-full max-w-md space-y-6 shadow-sm">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Set Up Your Account</h1>
          <p className="text-sm text-gray-500">
            Confirm your clinic and the phone number you&apos;d like to use for
            your patient account. We&apos;ll connect you to your existing record,
            or create a new one if you&apos;re visiting for the first time.
          </p>
        </div>

        <PortalLinkForm
          clinics={clinics ?? []}
          presetClinicId={presetClinicId}
          presetPhone={signupPhone ?? undefined}
        />
      </div>
    </div>
  );
}
