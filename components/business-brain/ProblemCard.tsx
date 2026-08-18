"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProblemView } from "@/lib/business-brain/briefing-view";

/**
 * Severity stripe down the left edge of a problem card. This is an ordered
 * scale, not a set of independent labels, so it gets its own tokens: dark mode
 * needs the five steps to stay distinguishable AND stay in order, which a
 * per-colour remap would not guarantee.
 */
const STRIPE: Record<string, string> = {
  critical: "bg-severity-critical",
  high: "bg-severity-high",
  medium: "bg-severity-medium",
  low: "bg-severity-low",
  info: "bg-severity-info",
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
    <section className="bg-surface border border-border rounded-xl overflow-hidden flex">
      <div className={cn("w-1 shrink-0", STRIPE[problem.severity] ?? STRIPE.info)} aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-[15px] font-semibold text-text-primary leading-snug">{problem.title}</h3>
            {problem.atStake && (
              <div className="text-right shrink-0">
                <div className="text-lg font-semibold text-text-primary tabular-nums leading-none">
                  {problem.atStake}
                </div>
                {problem.atStakeLabel && (
                  <div className="text-[11px] text-text-secondary mt-0.5">{problem.atStakeLabel}</div>
                )}
              </div>
            )}
          </div>
          <p className="text-sm text-text-body mt-1.5">{problem.summary}</p>
          <p className="text-sm text-text-secondary mt-2 leading-relaxed">{problem.explanation}</p>
        </div>

        {(problem.howToFix || problem.whyWeThink) && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="w-full flex items-center justify-between gap-3 px-5 py-2.5 border-t border-surface-muted text-left hover:bg-background transition-colors cursor-pointer"
            >
              <span className="text-sm text-text-body">{open ? "Show less" : "Show more"}</span>
              <ChevronDown
                className={cn("h-4 w-4 text-text-disabled shrink-0 transition-transform", open && "rotate-180")}
                aria-hidden
              />
            </button>
            {open && (
              <div className="px-5 pb-5 pt-1 space-y-4 animate-fade-in">
                {problem.howToFix && (
                  <div>
                    <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">How to fix this</p>
                    <p className="text-sm text-text-body leading-relaxed">{problem.howToFix}</p>
                  </div>
                )}
                {problem.whyWeThink && (
                  <div>
                    <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">Why we think this</p>
                    <p className="text-sm text-text-body leading-relaxed">{problem.whyWeThink}</p>
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
