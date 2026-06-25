"use client";

/**
 * AppointmentFilters
 *
 * Client component filter bar for the dentist appointments list.
 * Drives URL search params so the Server Component re-fetches filtered data.
 *
 * Behaviour:
 *   - Filters are staged locally and only applied when "Apply Filters" is
 *     clicked (search-as-you-type is debounced and applies on Enter / button).
 *   - From / To dates are independent: a future From date is allowed. When
 *     From > To the server returns no results (handled server-side).
 *
 * Filters:
 *   - Search (patient name or phone)
 *   - Status (select)
 *   - Date From / Date To (CalendarPicker)
 *   - Time From / Time To (time selects)
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
  { value: "scheduled", label: "Scheduled" },
  { value: "checked_in", label: "Checked In" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
];

// 30-min interval time options
const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = [{ value: "", label: "Any time" }];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const val = `${hh}:${mm}`;
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? "AM" : "PM";
      opts.push({ value: val, label: `${hour12}:${mm} ${ampm}` });
    }
  }
  return opts;
})();

interface AppointmentFiltersProps {
  today: string;
  initialSearch?: string;
  initialStatus?: string;
  initialDateFrom?: string;
  initialDateTo?: string;
  initialTimeFrom?: string;
  initialTimeTo?: string;
}

const selectClasses = cn(
  "w-full h-9 px-3 py-2 text-sm border border-[#E4E4E7] rounded-lg bg-white",
  "outline-none focus:ring-2 focus:ring-[#18181B] focus:ring-offset-1 focus:border-[#18181B]",
  "text-[#09090B] cursor-pointer"
);

export function AppointmentFilters({
  today,
  initialSearch = "",
  initialStatus = "",
  initialDateFrom = "",
  initialDateTo = "",
  initialTimeFrom = "",
  initialTimeTo = "",
}: AppointmentFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch]     = useState(initialSearch);
  const [status, setStatus]     = useState(initialStatus);
  const [dateFrom, setDateFrom] = useState(initialDateFrom || today);
  const [dateTo, setDateTo]     = useState(initialDateTo || today);
  const [timeFrom, setTimeFrom] = useState(initialTimeFrom);
  const [timeTo, setTimeTo]     = useState(initialTimeTo);

  // Only writes to the URL when explicitly invoked (button / Enter / reset).
  const apply = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("page"); // reset to page 1 on filter change

    const s = search.trim();
    if (s) sp.set("search", s); else sp.delete("search");
    if (status) sp.set("status", status); else sp.delete("status");
    if (dateFrom) sp.set("dateFrom", dateFrom); else sp.delete("dateFrom");
    if (dateTo) sp.set("dateTo", dateTo); else sp.delete("dateTo");
    if (timeFrom) sp.set("timeFrom", timeFrom); else sp.delete("timeFrom");
    if (timeTo) sp.set("timeTo", timeTo); else sp.delete("timeTo");

    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`);
    });
  }, [search, status, dateFrom, dateTo, timeFrom, timeTo, router, pathname, searchParams]);

  function handleReset() {
    setSearch("");
    setStatus("");
    setDateFrom(today);
    setDateTo(today);
    setTimeFrom("");
    setTimeTo("");
    startTransition(() => {
      router.push(pathname);
    });
  }

  const rangeInvalid = !!dateFrom && !!dateTo && dateFrom > dateTo;

  const hasActiveFilters =
    !!search ||
    !!status ||
    dateFrom !== today ||
    dateTo !== today ||
    !!timeFrom ||
    !!timeTo;

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
          aria-label="Search appointments by patient name or phone"
          className="pl-9"
        />
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap gap-4 items-end">
        {/* Status */}
        <div className="space-y-1.5 min-w-[140px]">
          <label htmlFor="appt-status" className="text-xs font-medium text-[#71717A] uppercase tracking-wide">
            Status
          </label>
          <select
            id="appt-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectClasses}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Date From — future dates allowed, independent of To */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#71717A] uppercase tracking-wide block">
            From Date
          </label>
          <CalendarPicker
            value={dateFrom}
            onChange={(d) => { if (d) setDateFrom(d); }}
            placeholder="From date"
            className="w-40"
          />
        </div>

        {/* Date To — independent of From */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#71717A] uppercase tracking-wide block">
            To Date
          </label>
          <CalendarPicker
            value={dateTo}
            onChange={(d) => { if (d) setDateTo(d); }}
            placeholder="To date"
            className="w-40"
          />
        </div>

        {/* Time From */}
        <div className="space-y-1.5 min-w-[120px]">
          <label htmlFor="appt-time-from" className="text-xs font-medium text-[#71717A] uppercase tracking-wide">
            From Time
          </label>
          <select
            id="appt-time-from"
            value={timeFrom}
            onChange={(e) => setTimeFrom(e.target.value)}
            className={selectClasses}
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Time To */}
        <div className="space-y-1.5 min-w-[120px]">
          <label htmlFor="appt-time-to" className="text-xs font-medium text-[#71717A] uppercase tracking-wide">
            To Time
          </label>
          <select
            id="appt-time-to"
            value={timeTo}
            onChange={(e) => setTimeTo(e.target.value)}
            className={selectClasses}
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
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
          From date is after To date — no appointments will match this range.
        </p>
      )}
    </div>
  );
}
