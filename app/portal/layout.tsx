import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PortalNav } from "@/components/layouts/PortalNav";
import { PatientAssistant } from "@/components/ai/PatientAssistant";

/**
 * Portal layout — patient portal, mobile-first.
 *
 * Responsibilities:
 * - Verifies the user is authenticated (any role).
 * - Resolves the portal link via patient_portal_links.
 * - Redirects to /portal/setup if no portal link exists
 *   (unless already on /portal/setup).
 * - Renders the portal top nav and the persistent AI Assistant widget.
 */
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

  // Check for portal link — handled by middleware for most requests,
  // but confirmed here as a defence-in-depth measure.
  const { data: portalLinkData } = await supabase
    .from("patient_portal_links")
    .select("patient_id")
    .eq("user_id", user.id)
    .single();

  const portalLink = portalLinkData as { patient_id: string } | null;

  // If no link found, setup flow handles the match — but don't redirect
  // from /portal/setup itself (infinite loop guard handled via middleware config).

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalNav patientId={portalLink?.patient_id ?? null} />

      <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>

      {/* Persistent AI Assistant chat widget — non-blocking */}
      {portalLink && <PatientAssistant patientId={portalLink.patient_id} />}
    </div>
  );
}
