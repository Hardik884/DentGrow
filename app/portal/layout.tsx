import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PortalNav } from "@/components/layouts/PortalNav";
import { PatientAssistant } from "@/components/ai/PatientAssistant";
import { getClinicSettings } from "@/actions/clinic-settings";

// Portal routes are authenticated and read request cookies — inherently
// per-request dynamic. Declaring it prevents the build from attempting static
// prerendering and emitting DYNAMIC_SERVER_USAGE errors.
export const dynamic = "force-dynamic";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: portalLinkData } = await supabase
    .from("patient_portal_links")
    .select("patient_id")
    .eq("user_id", user.id)
    .single();

  const portalLink = portalLinkData as { patient_id: string } | null;

  // Patient Consent Forms is a per-clinic pilot rollout — the "Consents" nav
  // item is hidden entirely for a patient whose clinic doesn't have it
  // enabled. getClinicSettings() resolves clinic_id from the caller's own
  // session (profiles.clinic_id), never a client-supplied value.
  const { data: clinicSettings } = await getClinicSettings();
  const consentFormsEnabled = clinicSettings?.consent_forms_enabled === true;

  return (
    <div className="min-h-screen bg-[#F6F8F6]">
      <PortalNav patientId={portalLink?.patient_id ?? null} consentFormsEnabled={consentFormsEnabled} />

      {/* pb-[4.5rem] on mobile ensures content isn't hidden under the bottom tab bar */}
      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 pb-[5rem] sm:pb-6 portal-main">
        {children}
      </main>

      {portalLink && <PatientAssistant patientId={portalLink.patient_id} />}
    </div>
  );
}

