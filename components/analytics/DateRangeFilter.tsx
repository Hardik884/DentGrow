"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

export function DateRangeFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  const from = searchParams.get("from") ?? thirtyDaysAgo;
  const to = searchParams.get("to") ?? today;

  function handleChange(key: "from" | "to", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="date-from" className="text-xs text-[#71717A] sr-only">From</label>
      <Input
        id="date-from"
        type="date"
        value={from}
        onChange={(e) => handleChange("from", e.target.value)}
        aria-label="Start date"
        className="w-36 text-xs h-8"
      />
      <span className="text-xs text-[#A1A1AA]">–</span>
      <label htmlFor="date-to" className="text-xs text-[#71717A] sr-only">To</label>
      <Input
        id="date-to"
        type="date"
        value={to}
        onChange={(e) => handleChange("to", e.target.value)}
        aria-label="End date"
        className="w-36 text-xs h-8"
      />
    </div>
  );
}
