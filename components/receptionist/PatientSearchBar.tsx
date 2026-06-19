"use client";

import { useRouter } from "next/navigation";
import { PatientSearch } from "@/components/shared/PatientSearch";
import type { Patient } from "@/types";

/**
 * PatientSearchBar
 *
 * Prominent patient search bar for the receptionist dashboard.
 * On selection → navigates to the patient's profile page.
 */
export function PatientSearchBar() {
  const router = useRouter();

  function handleSelect(patient: Patient) {
    router.push(`/receptionist/patients/${patient.id}`);
  }

  return (
    <div className="bg-white border rounded-lg p-4">
      <p className="text-sm font-medium text-gray-700 mb-2">Find Patient</p>
      <PatientSearch
        onSelect={handleSelect}
        placeholder="Search by name or phone number…"
      />
    </div>
  );
}
