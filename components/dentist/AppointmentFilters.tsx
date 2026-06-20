"use client";

/**
 * AppointmentFilters
 *
 * Client component filter bar for the dentist appointments list.
 * Drives URL search params so the Server Component re-fetches filtered data.
 *
 * Filters:
 *   - Status (select)
 *   - Date From / Date To (CalendarPicker)
 *   - Time From / Time To (time selects — optional, refines within the date range)
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { cn } from "@/lib/utils";
import { SlidersHorizontal, X } from "lucide-react";

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
  initialStatus?: string;
  initialDateFrom?: string;
  initialDateTo?: string;
  initialTimeFrom?: string;
  initialTimeTo?: string;
}

export function AppointmentFilters({
  today,
  initialStatus = "",
  initialDateFrom = "",
  initialDateTo = "",
  initialTimeFrom = "",
  initialTimeTo = "",
}: AppointmentFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [status, setStatus] = useState(initialStatus);
  const [dateFrom, setDateFrom] = useState(initialDateFrom || today);
  const [dateTo, setDateTo] = useState(initialDateTo || today);
  const [timeFrom, setTimeFrom] = useState(initialTimeFrom);
  const [timeTo, setTimeTo] = useState(initialTimeTo);

  const apply = useCallback(
    (overrides: Partial<{
      status: string;
      dateFrom: string;
      dateTo: string;
      timeFrom: string;
      timeTo: string;
    }> = {}) => {
      const s = overrides.status ?? status;
      const df = overrides.dateFrom ?? dateFrom;
      const dt = overrides.dateTo ?? dateTo;
      const tf = overrides.timeFrom ?? timeFrom;
      const tt = overrides.timeTo ?? timeTo;

      const sp = new URLSearchParams(searchParams.toString());
      sp.delete("page"); // reset to page 1 on filter change

      if (s) sp.set("status", s); else sp.delete("status");
      if (df) sp.set("dateFrom", df); else sp.delete("dateFrom");
      if (dt) sp.set("dateTo", dt); else sp.delete("dateTo");
      if (tf) sp.set("timeFrom", tf); else sp.delete("timeFrom");
      if (tt) sp.set("timeTo", tt); else sp.delete("timeTo");

      startTransition(() => {
        router.push(`${pathname}?${sp.toString()}`);
      });
    },
    [status, dateFrom, dateTo, timeFrom, timeTo, router, pathname, searchParams]
  );

  function handleReset() {
    setStatus("");
    setDateFrom(today);
    setDateTo(today);
    setTimeFrom("");
    setTimeTo("");
    startTransition(() => {
      router.push(pathname);
    });
  }

  const hasActiveFilters =
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
            onChange={(e) => {
              setStatus(e.target.value);
              apply({ status: e.target.value });
            }}
            className={cn(
              "w-full h-9 px-3 py-2 text-sm border border-[#E4E4E7] rounded-lg bg-white",
              "outline-none focus:ring-2 focus:ring-[#18181B] focus:ring-offset-1 focus:border-[#18181B]",
              "text-[#09090B] cursor-pointer"
            )}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Date From */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#71717A] uppercase tracking-wide block">
            From Date
          </label>
          <CalendarPicker
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(d) => {
              if (!d) return;
              setDateFrom(d);
              apply({ dateFrom: d });
            }}
            placeholder="From date"
            className="w-40"
          />
        </div>

        {/* Date To */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#71717A] uppercase tracking-wide block">
            To Date
          </label>
          <CalendarPicker
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(d) => {
              if (!d) return;
              setDateTo(d);
              apply({ dateTo: d });
            }}
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
            onChange={(e) => {
              setTimeFrom(e.target.value);
              apply({ timeFrom: e.target.value });
            }}
            className={cn(
              "w-full h-9 px-3 py-2 text-sm border border-[#E4E4E7] rounded-lg bg-white",
              "outline-none focus:ring-2 focus:ring-[#18181B] focus:ring-offset-1 focus:border-[#18181B]",
              "text-[#09090B] cursor-pointer"
            )}
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
            onChange={(e) => {
              setTimeTo(e.target.value);
              apply({ timeTo: e.target.value });
            }}
            className={cn(
              "w-full h-9 px-3 py-2 text-sm border border-[#E4E4E7] rounded-lg bg-white",
              "outline-none focus:ring-2 focus:ring-[#18181B] focus:ring-offset-1 focus:border-[#18181B]",
              "text-[#09090B] cursor-pointer"
            )}
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Active filter pills */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[#F4F4F5]">
          {status && (
            <FilterPill
              label={STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status}
              onRemove={() => { setStatus(""); apply({ status: "" }); }}
            />
          )}
          {(dateFrom !== today || dateTo !== today) && (
            <FilterPill
              label={dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`}
              onRemove={() => {
                setDateFrom(today);
                setDateTo(today);
                apply({ dateFrom: today, dateTo: today });
              }}
            />
          )}
          {timeFrom && (
            <FilterPill
              label={`After ${TIME_OPTIONS.find((t) => t.value === timeFrom)?.label ?? timeFrom}`}
              onRemove={() => { setTimeFrom(""); apply({ timeFrom: "" }); }}
            />
          )}
          {timeTo && (
            <FilterPill
              label={`Before ${TIME_OPTIONS.find((t) => t.value === timeTo)?.label ?? timeTo}`}
              onRemove={() => { setTimeTo(""); apply({ timeTo: "" }); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F4F4F5] text-xs text-[#09090B]">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="text-[#A1A1AA] hover:text-[#09090B] transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}
