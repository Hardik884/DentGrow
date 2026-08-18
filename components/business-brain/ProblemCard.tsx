"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProblemView } from "@/lib/business-brain/briefing-view";

const STRIPE: Record<string, string> = {
  critical: "bg-[#DC2626]",
  high: "bg-[#EA580C]",
  medium: "bg-[#B45309]",
  low: "bg-[#65A30D]",
  info: "bg-[#9BA39D]",
};

/**
 * One problem, left column. Collapsed it shows only the title, one concrete
 * summary line, and a short plain-English explanation — nothing a dentist has to
 * decode. "Show more" reveals how to fix it and why we think it, and nothing
 * else: no confidence, no metrics, no engine reasoning.
 */
export function ProblemCard({ problem }: { problem: ProblemView }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="bg-white border border-[#E3E9E6] rounded-xl overflow-hidden flex">
      <div className={cn("w-1 shrink-0", STRIPE[problem.severity] ?? STRIPE.info)} aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-[15px] font-semibold text-[#151918] leading-snug">{problem.title}</h3>
            {problem.atStake && (
              <div className="text-right shrink-0">
                <div className="text-lg font-semibold text-[#151918] tabular-nums leading-none">
                  {problem.atStake}
                </div>
                {problem.atStakeLabel && (
                  <div className="text-[11px] text-[#737A76] mt-0.5">{problem.atStakeLabel}</div>
                )}
              </div>
            )}
          </div>
          <p className="text-sm text-[#5B635E] mt-1.5">{problem.summary}</p>
          <p className="text-sm text-[#737A76] mt-2 leading-relaxed">{problem.explanation}</p>
        </div>

        {(problem.howToFix || problem.whyWeThink) && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="w-full flex items-center justify-between gap-3 px-5 py-2.5 border-t border-[#EEF2F0] text-left hover:bg-[#F6F8F6] transition-colors cursor-pointer"
            >
              <span className="text-sm text-[#5B635E]">{open ? "Show less" : "Show more"}</span>
              <ChevronDown
                className={cn("h-4 w-4 text-[#9BA39D] shrink-0 transition-transform", open && "rotate-180")}
                aria-hidden
              />
            </button>
            {open && (
              <div className="px-5 pb-5 pt-1 space-y-4 animate-fade-in">
                {problem.howToFix && (
                  <div>
                    <p className="text-xs font-medium text-[#737A76] uppercase tracking-wider mb-1">How to fix this</p>
                    <p className="text-sm text-[#5B635E] leading-relaxed">{problem.howToFix}</p>
                  </div>
                )}
                {problem.whyWeThink && (
                  <div>
                    <p className="text-xs font-medium text-[#737A76] uppercase tracking-wider mb-1">Why we think this</p>
                    <p className="text-sm text-[#5B635E] leading-relaxed">{problem.whyWeThink}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
