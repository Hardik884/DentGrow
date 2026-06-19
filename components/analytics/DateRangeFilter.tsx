"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * DateRangeFilter
 *
 * Analytics date range selector.
 * Updates URL search params (?from=&to=) — no state library needed.
 * Default: last 30 days.
 */
export function DateRangeFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const from = searchParams.get("from") ?? thirtyDaysAgo;
  const to = searchParams.get("to") ?? today;

  function handleChange(key: "from" | "to", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <input
        type="date"
        value={from}
        onChange={(e) => handleChange("from", e.target.value)}
        className="border rounded-md px-2 py-1 text-sm"
      />
      <span className="text-gray-400">to</span>
      <input
        type="date"
        value={to}
        onChange={(e) => handleChange("to", e.target.value)}
        className="border rounded-md px-2 py-1 text-sm"
      />
    </div>
  );
}
