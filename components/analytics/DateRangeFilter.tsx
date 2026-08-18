"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarPicker } from "@/components/ui/calendar-picker";

export function DateRangeFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  const from = searchParams.get("from") ?? thirtyDaysAgo;
  const to = searchParams.get("to") ?? today;

  function handleChange(key: "from" | "to", value: string) {
    if (!value) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-disabled sr-only">From</span>
      <CalendarPicker
        value={from}
        max={to}
        onChange={(d) => handleChange("from", d)}
        aria-label="Start date"
        className="w-36 text-xs"
      />
      <span className="text-xs text-text-disabled">–</span>
      <span className="text-xs text-text-disabled sr-only">To</span>
      <CalendarPicker
        value={to}
        min={from}
        onChange={(d) => handleChange("to", d)}
        aria-label="End date"
        className="w-36 text-xs"
      />
    </div>
  );
}
