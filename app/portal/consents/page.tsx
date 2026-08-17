import type { Metadata } from "next";
import { PortalConsentList } from "@/components/patient/PortalConsentList";
import { getPortalConsents } from "@/actions/consents";

export const metadata: Metadata = {
  title: "My Consent Forms",
};

export const dynamic = "force-dynamic";

/**
 * /portal/consents
 *
 * The patient's own signed consent forms (read-only). The patient is resolved
 * entirely from the session via the patient_consents view's RLS — the browser
 * never supplies a patient_id, and only the caller's own signed consents are
 * ever returned.
 */
export default async function PortalConsentsPage() {
  const res = await getPortalConsents();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-[#09090B]">My Consent Forms</h1>
        <p className="text-sm text-[#71717A] mt-0.5">
          Your consent forms. You can view, download, and print them here.
        </p>
      </div>

      {res.error ? (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {res.error}
        </p>
      ) : (
        <PortalConsentList consents={res.data ?? []} />
      )}
    </div>
  );
}
