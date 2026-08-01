"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Severity, Signal } from "@/business-brain";
import { confidenceLabel } from "@/lib/business-brain/dashboard-view";

interface SignalListProps {
  groups: readonly { severity: Severity; signals: readonly Signal[] }[];
}

const SEVERITY_META: Record<Severity, { label: string; badge: BadgeVariant; bar: string }> = {
  critical: { label: "Urgent", badge: "danger", bar: "bg-[#DC2626]" },
  high: { label: "Important", badge: "danger", bar: "bg-[#DC2626]" },
  medium: { label: "Worth noting", badge: "warning", bar: "bg-[#CA8A04]" },
  low: { label: "Minor", badge: "secondary", bar: "bg-[#A1A1AA]" },
  info: { label: "FYI", badge: "outline", bar: "bg-[#D4D4D8]" },
};

/**
 * One observation, with its evidence available on demand.
 *
 * Evidence is collapsed by default and never removed: the headline is what a
 * dentist reads in passing, the numbers behind it are what makes the claim
 * checkable rather than something to take on faith.
 */
function SignalRow({ signal }: { signal: Signal }) {
  const [open, setOpen] = useState(false);
  const meta = SEVERITY_META[signal.severity];
  const evidence = signal.evidence ?? [];

  return (
    <div className="border-b border-[#F4F4F5] last:border-b-0">
      <div className="flex items-start gap-3 px-5 py-4">
        <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", meta.bar)} aria-hidden />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-sm font-medium text-[#09090B] leading-snug">{signal.title}</h4>
            <Badge variant={meta.badge} className="shrink-0">
              {meta.label}
            </Badge>
          </div>

          <p className="text-sm text-[#71717A] mt-1 leading-relaxed">{signal.description}</p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            <span className="text-xs text-[#A1A1AA]">{confidenceLabel(signal.confidence)}</span>
            {evidence.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#71717A] hover:text-[#09090B] transition-colors"
              >
                {open ? "Hide" : "Show"} numbers
                <ChevronDown
                  className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
                  aria-hidden
                />
              </button>
            )}
          </div>

          {open && evidence.length > 0 && (
            <dl className="mt-3 rounded-lg bg-[#FAFAFA] border border-[#F4F4F5] divide-y divide-[#F4F4F5] animate-fade-in">
              {evidence.map((e) => (
                <div key={e.id} className="flex items-baseline justify-between gap-4 px-3 py-2">
                  <dt className="text-xs text-[#71717A] leading-relaxed">{e.description}</dt>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * What deserves attention — the second thing on the page, and the reason a
 * dentist opens it.
 *
 * Grouped by severity so the eye lands on the worst first. This is visual
 * hierarchy over a value the engine emits, not a running order: the Business
 * Brain deliberately does not rank, and nothing here says what to do first.
 */
export function SignalList({ groups }: SignalListProps) {
  if (groups.length === 0) {
    return (
      <div className="bg-white border border-[#E4E4E7] rounded-xl">
        <EmptyState
          title="Nothing unusual today"
          description="We checked everything and all your numbers look normal."
        />
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
      {groups.map((group) => (
        <div key={group.severity}>
          <div className="px-5 py-2.5 bg-[#FAFAFA] border-y border-[#F4F4F5] first:border-t-0">
            <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">
              {SEVERITY_META[group.severity].label}
            </p>
          </div>
          {group.signals.map((signal) => (
            <SignalRow key={signal.id} signal={signal} />
          ))}
        </div>
      ))}
    </div>
  );
}
