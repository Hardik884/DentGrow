"use client";

/**
 * FollowUpFilters
 *
 * Client component filter bar for the dentist follow-ups list.
 * Drives URL search params so the Server Component re-fetches filtered data.
 *
 * Behaviour:
 *   - Filters are staged locally and only applied when "Apply Filters" is
 *     clicked or Enter is pressed in the search field.
 *   - "Reset" clears all filters.
 *
 * Filters:
 *   - Search (patient name or phone)
 *   - Status (pending / completed / overdue)
 *   - Due Date From / Due Date To
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SlidersHorizontal, X, Search } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const selectClasses = cn(
  "w-full h-9 px-3 py-2 text-sm border border-[#E4E4E7] rounded-lg bg-white",
  "outline-none focus:ring-2 focus:ring-[#18181B] focus:ring-offset-1 focus:border-[#18181B]",
  "text-[#09090B] cursor-pointer"
);

interface FollowUpFiltersProps {
  initialSearch?: string;
  initialStatus?: string;
  initialDateFrom?: string;
  initialDateTo?: string;
}

export function FollowUpFilters({
  initialSearch = "",
  initialStatus = "",
  initialDateFrom = "",
  initialDateTo = "",
}: FollowUpFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch]     = useState(initialSearch);
  const [status, setStatus]     = useState(initialStatus);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo]     = useState(initialDateTo);

  const apply = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("page");

    const s = search.trim();
    if (s) sp.set("search", s); else sp.delete("search");
    if (status) sp.set("status", status); else sp.delete("status");
    if (dateFrom) sp.set("dateFrom", dateFrom); else sp.delete("dateFrom");
    if (dateTo)   sp.set("dateTo",   dateTo);   else sp.delete("dateTo");

    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`);
    });
  }, [search, status, dateFrom, dateTo, router, pathname, searchParams]);

  function handleReset() {
    setSearch("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
    startTransition(() => {
      router.push(pathname);
    });
  }

  const rangeInvalid = !!dateFrom && !!dateTo && dateFrom > dateTo;

  const hasActiveFilters = !!search || !!status || !!dateFrom || !!dateTo;

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
          aria-label="Search follow-ups by patient name or phone"
          className="pl-9"
        />
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap gap-4 items-end">
        {/* Status */}
        <div className="space-y-1.5 min-w-[140px]">
          <label htmlFor="fu-status" className="text-xs font-medium text-[#71717A] uppercase tracking-wide">
            Status
          </label>
          <select
            id="fu-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectClasses}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Due Date From */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#71717A] uppercase tracking-wide block">
            Due From
          </label>
          <CalendarPicker
            value={dateFrom}
            onChange={(d) => setDateFrom(d ?? "")}
            placeholder="From date"
            className="w-40"
            clearable
          />
        </div>

        {/* Due Date To */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#71717A] uppercase tracking-wide block">
            Due To
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
          From date is after To date — no follow-ups will match this range.
        </p>
      )}
    </div>
  );
}
