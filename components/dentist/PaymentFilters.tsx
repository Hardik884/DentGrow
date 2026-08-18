"use client";

/**
 * PaymentFilters
 *
 * Client component filter bar for the payments list.
 * Drives URL search params so the Server Component re-fetches filtered data.
 *
 * Behaviour:
 *   - Filters are staged locally and only applied when "Apply Filters" is
 *     clicked or Enter is pressed in the search field.
 *   - "Reset" clears all filters.
 *
 * Filters:
 *   - Search (patient name or phone)
 *   - Payment Method (cash, upi, card, bank_transfer)
 *   - Date From / Date To
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SlidersHorizontal, X, Search } from "lucide-react";

const PAYMENT_METHOD_OPTIONS = [
  { value: "", label: "All methods" },
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

const selectClasses = cn(
  "w-full h-9 px-3 py-2 text-sm border border-border rounded-lg bg-surface",
  "outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:border-accent",
  "text-text-primary cursor-pointer"
);

interface PaymentFiltersProps {
  initialSearch?: string;
  initialMethod?: string;
  initialDateFrom?: string;
  initialDateTo?: string;
}

export function PaymentFilters({
  initialSearch = "",
  initialMethod = "",
  initialDateFrom = "",
  initialDateTo = "",
}: PaymentFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch]     = useState(initialSearch);
  const [method, setMethod]     = useState(initialMethod);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo]     = useState(initialDateTo);

  const apply = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("page");

    const s = search.trim();
    if (s) sp.set("search", s); else sp.delete("search");
    if (method) sp.set("method", method); else sp.delete("method");
    if (dateFrom) sp.set("dateFrom", dateFrom); else sp.delete("dateFrom");
    if (dateTo)   sp.set("dateTo",   dateTo);   else sp.delete("dateTo");

    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`);
    });
  }, [search, method, dateFrom, dateTo, router, pathname, searchParams]);

  function handleReset() {
    setSearch("");
    setMethod("");
    setDateFrom("");
    setDateTo("");
    startTransition(() => {
      router.push(pathname);
    });
  }

  const rangeInvalid = !!dateFrom && !!dateTo && dateFrom > dateTo;

  const hasActiveFilters = !!search || !!method || !!dateFrom || !!dateTo;

  return (
    <div className="bg-surface border border-border rounded-xl px-5 py-4 space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-text-disabled" aria-hidden />
        <span className="text-sm font-semibold text-text-primary">Filters</span>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleReset}
            className="ml-auto flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-disabled" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
          placeholder="Search by patient name or phone…"
          aria-label="Search payments by patient name or phone"
          className="pl-9"
        />
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap gap-4 items-end">
        {/* Payment Method */}
        <div className="space-y-1.5 min-w-[160px]">
          <label htmlFor="payment-method" className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Payment Method
          </label>
          <select
            id="payment-method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className={selectClasses}
          >
            {PAYMENT_METHOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Date From */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block">
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
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block">
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
        <p className="text-xs text-danger">
          From date is after To date — no payments will match this range.
        </p>
      )}
    </div>
  );
}
