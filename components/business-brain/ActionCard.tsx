"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionCardView } from "@/lib/business-brain/briefing-view";

interface ActionCardProps {
  action: ActionCardView;
  /** Called once every required checklist item is ticked. */
  onComplete: (action: ActionCardView) => void;
}

/**
 * One thing to do, right column. A checklist a receptionist works through, plus
 * the buttons that open the real DentGrow screens where the work happens.
 *
 * Completion is honest: ticking the list marks the task done and clears the card
 * from view, but the clinic's health only actually moves when the real work
 * (recorded in DentGrow via the buttons) changes the underlying numbers — which
 * the page re-reads on the next load. A checkbox never fakes a result.
 */
export function ActionCard({ action, onComplete }: ActionCardProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [completing, setCompleting] = useState(false);

  const hasList = action.checklist.length > 0;

  function finish() {
    if (completing) return;
    setCompleting(true);
    // Let the success state play before the parent removes the card.
    setTimeout(() => onComplete(action), 650);
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (action.checklist.every((item) => next.has(item.id))) {
        // All done — complete on the next tick so the last tick renders first.
        setTimeout(finish, 120);
      }
      return next;
    });
  }

  return (
    <section
      className={cn(
        "relative bg-white border border-[#E4E4E7] rounded-xl overflow-hidden",
        completing && "animate-complete-out",
      )}
    >
      {completing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-[#F0FDF4]/95 animate-fade-in">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#16A34A]">
            <Check className="h-4 w-4 text-white" strokeWidth={3} />
          </span>
          <span className="text-sm font-semibold text-[#15803D]">Done</span>
        </div>
      )}

      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#52525B] bg-[#F4F4F5] rounded px-2 py-0.5">
            {action.ownerLabel}
          </span>
          <span className="text-[11px] text-[#A1A1AA]">{action.timeframeLabel}</span>
        </div>
        <h3 className="text-[15px] font-semibold text-[#09090B] leading-snug">{action.title}</h3>
        <p className="text-sm text-[#71717A] mt-1 leading-relaxed">{action.reason}</p>

        {hasList && (
          <ul className="mt-3 space-y-1.5">
            {action.checklist.map((item) => {
              const isChecked = checked.has(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    className="w-full flex items-start gap-2.5 text-left group cursor-pointer"
                  >
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 h-4 w-4 rounded border flex items-center justify-center transition-colors",
                        isChecked
                          ? "bg-[#16A34A] border-[#16A34A]"
                          : "border-[#D4D4D8] group-hover:border-[#A1A1AA]",
                      )}
                    >
                      {isChecked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </span>
                    <span
                      className={cn(
                        "text-sm leading-relaxed transition-colors",
                        isChecked ? "text-[#A1A1AA] line-through" : "text-[#52525B]",
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Buttons — open the real screens where the work is done */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {action.primary && (
            <Link
              href={action.primary.href}
              className="inline-flex items-center gap-2 rounded-lg bg-[#09090B] text-white px-3.5 py-2 text-sm font-medium hover:bg-[#27272A] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#09090B] focus-visible:ring-offset-2"
            >
              {action.primary.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
          {action.secondary && (
            <Link
              href={action.secondary.href}
              className="inline-flex items-center rounded-lg border border-[#E4E4E7] text-[#18181B] px-3.5 py-2 text-sm font-medium hover:bg-[#FAFAFA] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181B]/20"
            >
              {action.secondary.label}
            </Link>
          )}
          {!hasList && (
            <button
              type="button"
              onClick={finish}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#15803D] hover:text-[#166534] transition-colors cursor-pointer ml-auto"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              Mark done
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
