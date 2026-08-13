import type { Metadata } from "next";
import { PrescriptionList } from "@/components/patient/PrescriptionList";

export const metadata: Metadata = {
  title: "Prescriptions",
};

/**
 * /portal/prescriptions (audit B9)
 *
 * Read-only prescription list — patient view. A "prescription" is any of the
 * patient's own treatments carrying medications; resolved via the same
 * portal-link authorization `getPatientTreatments` already uses, so a patient
 * can never see another patient's — or another clinic's — prescriptions.
 */
export default async function PortalPrescriptionsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Prescriptions</h1>
      <PrescriptionList />
    </div>
  );
}
