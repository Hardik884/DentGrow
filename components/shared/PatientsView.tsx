"use client";

/**
 * PatientsView
 *
 * Client view for the Patients list page (dentist + receptionist).
 * Reads from the TanStack Query cache so return navigation is instant, while
 * the existing `getPatients` Server Action remains the source of truth.
 *
 * - First visit: skeleton → fetch → cache.
 * - Return visit: cached rows render immediately, silent background refresh.
 * - Search / pagination: keepPreviousData avoids empty-table flashes.
 *
 * The URL search params remain the source of state (soft navigation), so the
 * page stays shareable/bookmarkable and the Server Component shell is unchanged.
 */

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { getPatients } from "@/actions/patients";
import { queryKeys } from "@/lib/query/keys";
import { PatientListTable } from "@/components/shared/PatientListTable";
import { ListTableSkeleton } from "@/components/shared/ListTableSkeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PatientsViewProps {
  page: number;
  limit: number;
  search?: string;
  filter?: string;
  baseHref: string; // "/dentist" | "/receptionist"
}

export function PatientsView({ page, limit, search, filter, baseHref }: PatientsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchInput, setSearchInput] = useState(search ?? "");

  const { data, isPending, isError, error, isPlaceholderData, isFetching } =
    useQuery({
      queryKey: queryKeys.patients.list({ page, search: search ?? "", filter: filter ?? "" }),
      queryFn: async () => {
        const res = await getPatients({ page, limit, search, filter });
        if (res.error) throw new Error(res.error);
        return res.data ?? { patients: [], total: 0 };
      },
      placeholderData: keepPreviousData,
    });

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchInput.trim();
    const sp = new URLSearchParams();
    if (q) sp.set("search", q);
    if (filter) sp.set("filter", filter);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function clearSearch() {
    setSearchInput("");
    const sp = new URLSearchParams();
    if (filter) sp.set("filter", filter);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const total = data?.total ?? 0;
  const patients = data?.patients ?? [];
  // Skeleton only on the very first load (no cached/previous data yet).
  const showSkeleton = isPending;

  return (
    <>
      {/* Search bar */}
      <form onSubmit={submitSearch} className="flex gap-2 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-disabled"
            aria-hidden
          />
          <Input
            type="search"
            name="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or phone…"
            aria-label="Search patients"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary" size="sm">
          <Search className="h-3.5 w-3.5" aria-hidden />
          Search
        </Button>
        {search && (
          <Button type="button" variant="ghost" size="sm" onClick={clearSearch}>
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear
          </Button>
        )}
      </form>

      {search && !showSkeleton && (
        <p className="text-xs text-text-secondary mb-3">
          {total} result{total !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
        </p>
      )}

      {/* Error — keep any previously cached rows visible underneath */}
      {isError && (
        <p className="text-sm text-danger bg-danger-bg border border-danger-border rounded-md px-3 py-2 mb-3">
          {(error as Error)?.message ?? "Failed to load patients."}
        </p>
      )}

      {showSkeleton ? (
        <ListTableSkeleton />
      ) : (
        <div
          className={
            isPlaceholderData && isFetching
              ? "opacity-60 transition-opacity"
              : "transition-opacity"
          }
        >
          <PatientListTable
            patients={patients}
            total={total}
            page={page}
            limit={limit}
            baseHref={baseHref}
            search={search}
          />
        </div>
      )}
    </>
  );
}
