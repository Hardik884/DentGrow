"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FocusCard as FocusCardModel } from "@/lib/business-brain/dashboard-view";
import type { WorkflowCardView } from "@/lib/business-brain/workflow-view";
import type { ActionPlanView } from "@/lib/business-brain/action-view";
import { DiagnosisList } from "./DiagnosisList";

interface FocusCardProps {
  card: FocusCardModel;
  signalDescriptions: readonly string[];
  defaultOpen?: boolean;
  /** Workflows that address this problem. */
  workflows?: readonly WorkflowCardView[];
  /** The prepared action plan for this problem. */
  actionPlan?: ActionPlanView | null;
}

const STRIPE: Record<string, string> = {
  critical: "bg-[#DC2626]",
  high: "bg-[#EA580C]",
  medium: "bg-[#CA8A04]",
  low: "bg-[#65A30D]",
  info: "bg-[#A1A1AA]",
};

/**
 * One problem card — the core unit of the Business Brain.
 *
 * Redesigned to be self-contained: each card now carries the problem, its value,
 * the recommended action, AND the primary click — everything a dentist needs to
 * decide and act without scrolling to a separate section.
 *
 * Structure:
 *   Title + Value at stake  (scannable in 2 seconds)
 *   Action recommendation   (what to do)
 *   Primary CTA button      (one click to start)
 *   ▸ More detail           (workflow steps + diagnosis reasoning, on demand)
 */
export function FocusCard({
  card,
  signalDescriptions,
  defaultOpen = false,
  workflows = [],
  actionPlan = null,
}: FocusCardProps) {
  const [detailOpen, setDetailOpen] = useState(defaultOpen);

  // The primary action comes from the action plan — it's the one click.
  const primaryAction = actionPlan?.primary ?? null;

  return (
    <section className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden flex">
      <div className={cn("w-1 shrink-0", STRIPE[card.severity] ?? STRIPE.info)} aria-hidden />

      <div className="flex-1 min-w-0">
        {/* Header: problem + value at stake */}
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <h3 className="text-base font-semibold text-[#09090B] leading-snug">{card.title}</h3>
            {card.atStake !== null && (
              <div className="text-right shrink-0">
                <div className="text-2xl font-semibold text-[#09090B] tabular-nums leading-none">
                  {card.atStake}
                </div>
                {card.atStakeLabel !== null && (
                  <div className="text-xs text-[#71717A] mt-1">{card.atStakeLabel}</div>
                )}
              </div>
            )}
          </div>

          {/* Strategy: what to do — compact, one or two lines max */}
          {card.actions.length > 0 && (
            <div className="mt-3">
              {card.actions.slice(0, 1).map((action, i) => (
                <div key={`${card.id}-action-${i}`} className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded",
                      action.kind === "act"
                        ? "bg-[#F0FDF4] text-[#15803D]"
                        : "bg-[#F4F4F5] text-[#52525B]",
                    )}
                  >
                    {action.kind === "act" ? "Do this" : "Find out"}
                  </span>
                  <p className="text-sm text-[#52525B] leading-relaxed">
                    {action.title}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Primary action button — the one click that matters */}
          {primaryAction && primaryAction.href && (
            <div className="mt-4">
              <Link
                href={primaryAction.href}
                className="inline-flex items-center gap-2 rounded-lg bg-[#09090B] text-white px-4 py-2 text-sm font-medium hover:bg-[#27272A] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] focus-visible:ring-offset-2"
              >
                {primaryAction.actionLabel}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
              {primaryAction.appliedFilters.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[10px] font-medium text-[#16A34A] uppercase tracking-wide">
                    Pre-filtered:
                  </span>
                  {primaryAction.appliedFilters.map((f) => (
                    <span
                      key={`${f.key}-${f.value}`}
                      className="text-[11px] text-[#52525B] bg-[#F4F4F5] border border-[#E4E4E7] rounded px-1.5 py-0.5"
                    >
                      {f.key}: {f.value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Expandable detail: workflow steps + diagnosis reasoning */}
        {(card.diagnoses.length > 0 || workflows.length > 0 || (card.actions.length > 1)) && (
          <>
            <button
              type="button"
              onClick={() => setDetailOpen((v) => !v)}
              aria-expanded={detailOpen}
              className="w-full flex items-center justify-between gap-3 px-5 py-3 border-t border-[#F4F4F5] text-left hover:bg-[#FAFAFA] transition-colors cursor-pointer"
            >
              <span className="text-sm text-[#52525B]">
                {detailOpen ? "Less detail" : "More detail"}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-[#A1A1AA] shrink-0 transition-transform",
                  detailOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>

            {detailOpen && (
              <div className="px-5 pb-5 space-y-5 animate-fade-in">
                {/* Additional actions beyond the first */}
                {card.actions.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">
                      Also consider
                    </p>
                    {card.actions.slice(1).map((action, i) => (
                      <div key={`${card.id}-extra-action-${i}`} className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            "mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded",
                            action.kind === "act"
                              ? "bg-[#F0FDF4] text-[#15803D]"
                              : "bg-[#F4F4F5] text-[#52525B]",
                          )}
                        >
                          {action.kind === "act" ? "Do this" : "Find out"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm text-[#09090B]">{action.title}</p>
                          <p className="text-xs text-[#71717A] mt-0.5">{action.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Workflow steps — how to do it */}
                {workflows.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">
                      Step by step
                    </p>
                    {workflows.slice(0, 1).map((workflow) => (
                      <div key={workflow.id} className="space-y-2">
                        <p className="text-xs text-[#52525B]">
                          {workflow.ownerLabel} · {workflow.effortLabel} · {workflow.timeframeLabel}
                        </p>
                        <ol className="space-y-1.5 pl-1">
                          {workflow.tasks.map((task) => (
                            <li key={task.id} className="flex gap-2.5">
                              <span className="shrink-0 w-4 h-4 rounded-full bg-[#F4F4F5] text-[9px] font-semibold text-[#52525B] flex items-center justify-center mt-0.5">
                                {task.order}
                              </span>
                              <p className="text-sm text-[#52525B] leading-relaxed">
                                {task.instruction}
                              </p>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                )}

                {/* Diagnosis reasoning — why we think this */}
                {card.diagnoses.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">
                      Why we think this
                    </p>
                    <DiagnosisList
                      diagnoses={card.diagnoses}
                      signalDescriptions={[...signalDescriptions]}
                    />
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
