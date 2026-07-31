"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FocusCard as FocusCardModel } from "@/lib/business-brain/dashboard-view";
import { DiagnosisList } from "./DiagnosisList";

interface FocusCardProps {
  card: FocusCardModel;
  /** Descriptions of every signal in the run, for the AI explanation's fact set. */
  signalDescriptions: readonly string[];
  /** Cards above the fold open their detail by default. */
  defaultOpen?: boolean;
}

/**
 * One problem, in the order a dentist asks about it.
 *
 *   what is it   the title, in words a clinic uses out loud
 *   how much     the figure, given the most visual weight on the card
 *   what to do   the action, which is the only line most readers will act on
 *   why          collapsed, because it is a follow-up question and not the point
 *
 * The severity stripe carries the ranking without a badge saying "critical".
 * Cards are already ordered worst-first, so a colour is enough to confirm what
 * the position has said; a word would be a second thing to read for no extra
 * information.
 */

const STRIPE: Record<string, string> = {
  critical: "bg-[#DC2626]",
  high: "bg-[#EA580C]",
  medium: "bg-[#CA8A04]",
  low: "bg-[#65A30D]",
  info: "bg-[#A1A1AA]",
};

export function FocusCard({ card, signalDescriptions, defaultOpen = false }: FocusCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden flex">
      <div className={cn("w-1 shrink-0", STRIPE[card.severity] ?? STRIPE.info)} aria-hidden />

      <div className="flex-1 min-w-0">
        <div className="px-5 py-4">
          {/* What it is, and how much of it there is. */}
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

          {/* What to do. The line most readers will act on, so it is not buried. */}
          {card.actions.length > 0 && (
            <ul className="mt-4 space-y-3">
              {card.actions.map((action, i) => (
                <li key={`${card.id}-action-${i}`} className="flex gap-3">
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded",
                      action.kind === "act"
                        ? "bg-[#F0FDF4] text-[#15803D]"
                        : "bg-[#F4F4F5] text-[#52525B]",
                    )}
                  >
                    {/* "Find out" rather than "investigate": the engine could not
                        settle the cause, and saying so plainly is more useful
                        than a confident-sounding word for the same uncertainty. */}
                    {action.kind === "act" ? "Do this" : "Find out"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#09090B]">{action.title}</p>
                    <p className="text-sm text-[#52525B] mt-0.5 leading-relaxed">
                      {action.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Why. A follow-up question, so it opens on request. */}
        {card.diagnoses.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="w-full flex items-center justify-between gap-3 px-5 py-3 border-t border-[#F4F4F5] text-left hover:bg-[#FAFAFA] transition-colors"
            >
              <span className="text-sm text-[#52525B]">Why we think this</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-[#A1A1AA] shrink-0 transition-transform",
                  open && "rotate-180",
                )}
                aria-hidden
              />
            </button>
            {open && (
              <div className="px-5 pb-5 animate-fade-in">
                <DiagnosisList
                  diagnoses={card.diagnoses}
                  signalDescriptions={[...signalDescriptions]}
                />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
