"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Metric } from "@/business-brain";
import type { MetricGroup } from "@/lib/business-brain/dashboard-view";
import { MetricGrid } from "./MetricGrid";

interface TodaysNumbersProps {
  /** The few figures a dentist checks daily, in a fixed order. */
  headline: readonly Metric[];
  /** Everything measured, grouped, shown only on request. */
  groups: readonly MetricGroup[];
  measuredCount: number;
}

/**
 * The day's figures, with a floor on how much has to be read.
 *
 * The full set runs past twenty tiles. Twenty tiles is not a summary — the three
 * numbers that moved get exactly the same weight as the seventeen that did not,
 * so the reader does the sorting the page should have done. Six show by default,
 * chosen because a dentist looks at them whether or not anything is wrong: how
 * many patients, how much work, how much money in, how much owed, how full the
 * chairs were, who is waiting.
 *
 * The rest are one click away rather than removed. They are the numbers someone
 * checks when they want to verify a finding, and a dashboard that hides its
 * workings is harder to trust than one that folds them.
 */
export function TodaysNumbers({ headline, groups, measuredCount }: TodaysNumbersProps) {
  const [showAll, setShowAll] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold text-[#09090B]">Today&apos;s numbers</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {headline.map((metric) => (
          <div key={metric.id} className="bg-white border border-[#E4E4E7] rounded-xl p-4">
            <p className="text-xs font-medium text-[#71717A] tracking-wide leading-snug">
              {metric.name}
            </p>
            <p className="text-xl font-semibold text-[#09090B] tracking-tight mt-1.5">
              {formatHeadline(metric)}
            </p>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        aria-expanded={showAll}
        className="flex items-center gap-2 text-sm text-[#52525B] hover:text-[#09090B] transition-colors"
      >
        {showAll ? "Hide the rest" : `See all ${measuredCount} figures`}
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", showAll && "rotate-180")}
          aria-hidden
        />
      </button>

      {showAll && (
        <div className="pt-2 animate-fade-in">
          <MetricGrid groups={groups} />
        </div>
      )}
    </section>
  );
}

/** Same formatting the full grid uses, kept in step by sharing the rules. */
function formatHeadline(metric: Metric): string {
  switch (metric.unit) {
    case "currency":
      return `₹${Math.round(metric.value).toLocaleString("en-IN")}`;
    case "percentage":
      return `${metric.value}%`;
    case "minutes":
      return metric.value >= 120
        ? `${Math.round((metric.value / 60) * 10) / 10} hr`
        : `${metric.value} min`;
    case "hours":
      return `${metric.value} hr`;
    case "days":
      return `${metric.value} ${metric.value === 1 ? "day" : "days"}`;
    default:
      return String(metric.value);
  }
}
