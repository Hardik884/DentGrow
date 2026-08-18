"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface SegmentedTabsProps {
  tabs: { key: string; label: string }[];
  /** Pre-rendered content for each tab, keyed the same as `tabs[].key`. Both
   * panels are already fetched server-side (this wraps Server Component
   * output) — switching tabs only toggles which one is mounted, no re-fetch. */
  panels: Record<string, React.ReactNode>;
  defaultKey?: string;
}

/**
 * SegmentedTabs — small [ A ] [ B ] pill toggle used for the
 * Billing & Payments "Bill / Payments" (and portal "Bills / Payments") split.
 *
 * A client component only for the tiny bit of local UI state (which panel is
 * showing); the panels themselves are Server Component output passed in as
 * props, so no data re-fetch happens on toggle.
 */
export function SegmentedTabs({ tabs, panels, defaultKey }: SegmentedTabsProps) {
  const [active, setActive] = useState(defaultKey ?? tabs[0]?.key);

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        className="inline-flex items-center gap-0.5 rounded-lg bg-surface-muted p-1 no-print"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={cn(
              "px-3.5 py-1.5 text-sm font-medium rounded-md transition-all duration-150 cursor-pointer",
              active === tab.key
                ? "bg-surface text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <div key={tab.key} className={active === tab.key ? "" : "hidden"}>
          {panels[tab.key]}
        </div>
      ))}
    </div>
  );
}
