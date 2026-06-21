import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PortalNav } from "@/components/layouts/PortalNav";
import { PatientAssistant } from "@/components/ai/PatientAssistant";

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

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <PortalNav patientId={portalLink?.patient_id ?? null} />

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 portal-main">
        {children}
      </main>

      {portalLink && <PatientAssistant patientId={portalLink.patient_id} />}
    </div>
  );
}

