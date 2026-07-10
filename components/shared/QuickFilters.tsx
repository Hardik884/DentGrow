"use client";

/**
 * QuickFilters
 *
 * Reusable quick-filter chips that sit above a page's detailed filter bar.
 * Each chip declaratively sets a subset of URL search params; every other
 * tracked key is cleared so chips are mutually exclusive and their active
 * state can be derived by an exact comparison against the current URL.
 *
 * Behaviour:
 *   - Clicking a chip writes to the URL via router.push inside a transition,
 *     so it reuses the existing server-driven data fetch (no full reload) and
 *     TanStack Query caches keep return navigation instant.
 *   - Non-tracked params (e.g. `search`) are preserved across chips.
 *   - Active state is computed from the URL, so it stays in sync with the
 *     detailed filter bar and deep links.
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

export interface QuickFilterChip {
  label: string;
  /**
   * The tracked params this chip sets. Any tracked key NOT listed here is
   * cleared when the chip is applied. Values are exact strings.
   */
  set: Record<string, string>;
}

interface QuickFiltersProps {
  /**
   * The full set of URL param keys this chip group owns. Applying a chip
   * clears every tracked key that the chip does not explicitly set.
   */
  trackKeys: string[];
  chips: QuickFilterChip[];
  className?: string;
}

export function QuickFilters({ trackKeys, chips, className }: QuickFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function applyChip(chip: QuickFilterChip) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("page");
    for (const key of trackKeys) {
      const value = chip.set[key];
      if (value === undefined || value === "") sp.delete(key);
      else sp.set(key, value);
    }
    const qs = sp.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function isActive(chip: QuickFilterChip): boolean {
    return trackKeys.every((key) => {
      const expected = chip.set[key] ?? "";
      const current = searchParams.get(key) ?? "";
      return expected === current;
    });
  }

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      role="group"
      aria-label="Quick filters"
    >
      {chips.map((chip) => {
        const active = isActive(chip);
        return (
          <button
            key={chip.label}
            type="button"
            onClick={() => applyChip(chip)}
            disabled={isPending}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center h-7 px-3 rounded-full text-xs font-medium border transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
              active
                ? "bg-accent text-white border-accent"
                : "bg-white text-text-secondary border-border hover:bg-surface hover:text-text-primary hover:border-border-strong",
              isPending && "opacity-70"
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
