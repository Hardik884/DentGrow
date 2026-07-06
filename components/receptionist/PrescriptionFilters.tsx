"use client";

/**
 * PrescriptionFilters
 *
 * Client component filter bar for the receptionist prescription history list.
 * Drives URL search params so the Server Component re-fetches filtered data.
 *
 * Filters:
 *   - Search (patient name or phone)
 *   - Treatment Type (free text)
 *   - Prescribing Dentist (select)
 *   - Medicine Name (free text)
 *   - Date From / Date To (CalendarPicker — based on performed_at)
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SlidersHorizontal, X, Search } from "lucide-react";

const selectClasses = cn(
  "w-full h-9 px-3 py-2 text-sm border border-[#E4E4E7] rounded-lg bg-white",
  "outline-none focus:ring-2 focus:ring-[#18181B] focus:ring-offset-1 focus:border-[#18181B]",
  "text-[#09090B] cursor-pointer"
);

interface PrescriptionFiltersProps {
  dentists: Array<{ id: string; name: string }>;
  initialSearch?: string;
  initialTreatmentType?: string;
  initialDentistId?: string;
  initialMedicineName?: string;
  initialDateFrom?: string;
  initialDateTo?: string;
}

export function PrescriptionFilters({
  dentists,
  initialSearch = "",
  initialTreatmentType = "",
  initialDentistId = "",
  initialMedicineName = "",
  initialDateFrom = "",
  initialDateTo = "",
}: PrescriptionFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch]               = useState(initialSearch);
  const [treatmentType, setTreatmentType] = useState(initialTreatmentType);
  const [dentistId, setDentistId]         = useState(initialDentistId);
  const [medicineName, setMedicineName]   = useState(initialMedicineName);
  const [dateFrom, setDateFrom]           = useState(initialDateFrom);
  const [dateTo, setDateTo]               = useState(initialDateTo);

  const apply = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("page");

    const s = search.trim();
    if (s) sp.set("search", s); else sp.delete("search");
    const tt = treatmentType.trim();
    if (tt) sp.set("treatmentType", tt); else sp.delete("treatmentType");
    if (dentistId) sp.set("dentistId", dentistId); else sp.delete("dentistId");
    const mn = medicineName.trim();
    if (mn) sp.set("medicineName", mn); else sp.delete("medicineName");
    if (dateFrom) sp.set("dateFrom", dateFrom); else sp.delete("dateFrom");
    if (dateTo)   sp.set("dateTo",   dateTo);   else sp.delete("dateTo");

    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`);
    });
  }, [search, treatmentType, dentistId, medicineName, dateFrom, dateTo, router, pathname, searchParams]);

  function handleReset() {
    setSearch("");
    setTreatmentType("");
    setDentistId("");
    setMedicineName("");
    setDateFrom("");
    setDateTo("");
    startTransition(() => {
      router.push(pathname);
    });
  }

  const rangeInvalid = !!dateFrom && !!dateTo && dateFrom > dateTo;

  const hasActiveFilters =
    !!search || !!treatmentType || !!dentistId || !!medicineName || !!dateFrom || !!dateTo;

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-xl px-5 py-4 space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-[#A1A1AA]" aria-hidden />
        <span className="text-sm font-semibold text-[#09090B]">Filters</span>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleReset}
            className="ml-auto flex items-center gap-1 text-xs text-[#71717A] hover:text-[#09090B] transition-colors"
          >
            <X className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#A1A1AA]" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
          placeholder="Search by patient name or phone…"
          aria-label="Search prescriptions by patient name or phone"
          className="pl-9"
        />
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap gap-4 items-end">
        {/* Treatment Type */}
        <div className="space-y-1.5 min-w-[160px]">
          <label htmlFor="rx-treatment-type" className="text-xs font-medium text-[#71717A] uppercase tracking-wide">
            Treatment Type
          </label>
          <Input
            id="rx-treatment-type"
            type="text"
            value={treatmentType}
            onChange={(e) => setTreatmentType(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
            placeholder="e.g. Root Canal"
            aria-label="Filter by treatment type"
          />
        </div>

        {/* Prescribing Dentist */}
        <div className="space-y-1.5 min-w-[180px]">
          <label htmlFor="rx-dentist" className="text-xs font-medium text-[#71717A] uppercase tracking-wide">
            Prescribing Dentist
          </label>
          <select
            id="rx-dentist"
            value={dentistId}
            onChange={(e) => setDentistId(e.target.value)}
            className={selectClasses}
          >
            <option value="">All dentists</option>
            {dentists.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Medicine Name */}
        <div className="space-y-1.5 min-w-[160px]">
          <label htmlFor="rx-medicine" className="text-xs font-medium text-[#71717A] uppercase tracking-wide">
            Medicine Name
          </label>
          <Input
            id="rx-medicine"
            type="text"
            value={medicineName}
            onChange={(e) => setMedicineName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
            placeholder="e.g. Amoxicillin"
            aria-label="Filter by medicine name"
          />
        </div>

        {/* Date From */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#71717A] uppercase tracking-wide block">
            From Date
          </label>
          <CalendarPicker
            value={dateFrom}
            onChange={(d) => setDateFrom(d ?? "")}
            placeholder="From date"
            className="w-40"
            clearable
          />
        </div>

        {/* Date To */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#71717A] uppercase tracking-wide block">
            To Date
          </label>
          <CalendarPicker
            value={dateTo}
            onChange={(d) => setDateTo(d ?? "")}
            placeholder="To date"
            className="w-40"
            clearable
          />
        </div>

        {/* Apply button */}
        <div className="space-y-1.5">
          <Button type="button" size="sm" onClick={apply} isLoading={isPending}>
            <Search className="h-3.5 w-3.5" aria-hidden />
            Apply Filters
          </Button>
        </div>
      </div>

      {rangeInvalid && (
        <p className="text-xs text-[#DC2626]">
          From date is after To date — no prescriptions will match this range.
        </p>
      )}
    </div>
  );
}
