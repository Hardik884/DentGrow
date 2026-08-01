"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Metric } from "@/business-brain";
import type { MetricGroup } from "@/lib/business-brain/dashboard-view";
import { MetricGrid } from "./MetricGrid";

interface AllNumbersProps {
  headline: readonly Metric[];
  groups: readonly MetricGroup[];
  measuredCount: number;
}

/**
 * Full metrics — reference material, available on demand.
 *
 * The headline numbers are already shown in the Status Banner. This section
 * gives access to the complete set for anyone who wants to verify a finding
 * or check a specific number. It starts collapsed because showing 28 tiles
 * on the morning briefing is noise, not signal.
 */
export function AllNumbers({ headline, groups, measuredCount }: AllNumbersProps) {
  const [open, setOpen] = useState(false);

  if (measuredCount === 0) return null;

  return (
    <section className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[#FAFAFA] transition-colors cursor-pointer"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#09090B]">All the numbers</h3>
          <p className="text-xs text-[#71717A] mt-0.5">
            {measuredCount} numbers across money, appointments, treatments, and more
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[#A1A1AA] shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-[#F4F4F5] px-5 py-5 animate-fade-in">
          <MetricGrid groups={groups} />
        </div>
      )}
    </section>
  );
}
