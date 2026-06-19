import type { Metadata } from "next";
import { TreatmentHistoryList } from "@/components/patient/TreatmentHistoryList";

export const metadata: Metadata = {
  title: "Treatment History — DentGrow",
};

/**
 * /portal/treatments
 * Treatment history — patient view.
 * Reads from patient_treatments view — patient_visible_notes only.
 * internal_notes are NEVER exposed here.
 */
export default async function PortalTreatmentsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Treatment History</h1>
      <TreatmentHistoryList />
    </div>
  );
}

