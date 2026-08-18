"use client";

import { useRouter } from "next/navigation";
import { PatientSearch } from "@/components/shared/PatientSearch";
import type { Patient } from "@/types";
import { Search } from "lucide-react";

export function PatientSearchBar() {
  const router = useRouter();

  function handleSelect(patient: Patient) {
    router.push(`/receptionist/patients/${patient.id}`);
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Search className="h-4 w-4 text-text-secondary" aria-hidden />
        <h2 className="text-sm font-semibold text-text-primary">Patient Search</h2>
      </div>
      <PatientSearch
        onSelect={handleSelect}
        placeholder="Search by name or phone number…"
      />
    </div>
  );
}
