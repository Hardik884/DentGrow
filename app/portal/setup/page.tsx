import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PortalLinkForm } from "@/components/patient/PortalLinkForm";

export const metadata: Metadata = {
  title: "Account Setup — DentGrow",
};

/**
 * /portal/setup
 * Portal account linking flow — shown when a user has signed up
 * but has no entry in patient_portal_links.
 *
 * Flow:
 * 1. User enters their phone number.
 * 2. Server Action (actions/portal-link.ts → linkPortalAccount) searches
 *    for an active patient record with that phone in the clinic.
 * 3. If match found → creates patient_portal_links row → redirects to /portal.
 * 4. If no match → displays "Contact your clinic to link your account" message.
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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border p-6 w-full max-w-md space-y-6 shadow-sm">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Link Your Account</h1>
          <p className="text-sm text-gray-500">
            Enter the phone number registered with your clinic to connect your
            patient record.
          </p>
        </div>

        <PortalLinkForm />

        <p className="text-xs text-gray-400 text-center">
          Don&apos;t have a patient record yet?{" "}
          <span className="font-medium text-gray-500">
            Contact your clinic to register first.
          </span>
        </p>
      </div>
    </div>
  );
}
