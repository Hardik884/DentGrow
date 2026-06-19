import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalProfile } from "@/actions/portal-link";
import { PortalProfileView } from "@/components/patient/PortalProfileView";

export const metadata: Metadata = {
  title: "My Profile — DentGrow",
};

/**
 * /portal/profile
 *
 * Patient portal — view and update allowed profile fields.
 *
 * Patient CAN update:
 *   - phone
 *   - address
 *   - emergency_contact_name
 *   - emergency_contact_phone
 *
 * Patient CANNOT update:
 *   - name (clinical / receptionist-set)
 *   - date_of_birth (clinical)
 *   - gender (clinical)
 *   - notes (internal clinical notes — never shown)
 *   - total_visits, last_visit (computed / system)
 */
export default async function PortalProfilePage() {
  const result = await getPortalProfile();

  if (result.error === "Portal account not linked.") {
    redirect("/portal/setup");
  }

  if (!result.data) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">My Profile</h1>
        <div className="border rounded-lg p-4 text-sm text-red-600 bg-red-50">
          Unable to load your profile. Please try refreshing the page.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">My Profile</h1>
      <PortalProfileView profile={result.data} />
    </div>
  );
}

