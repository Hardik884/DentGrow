"use client";

import { useState, useCallback } from "react";
import { searchPatients } from "@/actions/patients";
import { Input } from "@/components/ui/input";
import { PatientAvatar } from "./PatientAvatar";
import { LoadingSpinner } from "./LoadingSpinner";
import type { Patient } from "@/types";

interface PatientSearchProps {
  onSelect?: (patient: Patient) => void;
  placeholder?: string;
}

export function PatientSearch({
  onSelect,
  placeholder = "Search by name or phone…",
}: PatientSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);

      if (debounceTimer) clearTimeout(debounceTimer);

      if (value.trim().length < 2) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      const timer = setTimeout(async () => {
        setIsLoading(true);
        const result = await searchPatients(value.trim());
        setResults(result.data ?? []);
        setIsOpen(true);
        setIsLoading(false);
      }, 300);

      setDebounceTimer(timer);
    },
    [debounceTimer]
  );

  return (
    <div className="relative">
      <div className="relative">
        <Input
          type="search"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          aria-label="Search patients"
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <LoadingSpinner size="sm" />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <ul className="absolute z-20 w-full mt-1 bg-white border border-[#E4E4E7] rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {results.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect?.(patient);
                  setQuery(patient.name);
                  setResults([]);
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2.5 text-left hover:bg-[#FAFAFA] flex items-center gap-3 transition-colors"
              >
                <PatientAvatar name={patient.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#09090B] truncate">{patient.name}</p>
                  {patient.phone && (
                    <p className="text-xs text-[#71717A]">{patient.phone}</p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {isOpen && !isLoading && query.trim().length >= 2 && results.length === 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-[#E4E4E7] rounded-xl shadow-lg p-4">
          <p className="text-sm text-[#71717A] text-center">No patients found</p>
        </div>
      )}
    </div>
  );
}
