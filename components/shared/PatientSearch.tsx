"use client";

import { useState, useCallback } from "react";
import { searchPatients } from "@/actions/patients";
import type { Patient } from "@/types";

interface PatientSearchProps {
  onSelect?: (patient: Patient) => void;
  placeholder?: string;
}

/**
 * PatientSearch
 *
 * Debounced search input with dropdown results.
 * Searches by name + phone via trigram index.
 * Used by: dentist and receptionist patient list pages.
 *
 * Calls: actions/patients.ts → searchPatients(query)
 */
export function PatientSearch({
  onSelect,
  placeholder = "Search patients by name or phone…",
}: PatientSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);

      if (debounceTimer) clearTimeout(debounceTimer);

      if (value.trim().length < 2) {
        setResults([]);
        return;
      }

      const timer = setTimeout(async () => {
        setIsLoading(true);
        const result = await searchPatients(value.trim());
        setResults(result.data ?? []);
        setIsLoading(false);
      }, 300);

      setDebounceTimer(timer);
    },
    [debounceTimer]
  );

  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {isLoading && (
        <div className="absolute right-3 top-2.5 text-gray-400 text-xs">
          Searching…
        </div>
      )}

      {results.length > 0 && (
        <ul className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect?.(patient);
                  setQuery(patient.name);
                  setResults([]);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between"
              >
                <span className="font-medium">{patient.name}</span>
                <span className="text-gray-400 text-xs">{patient.phone ?? "No phone"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
