"use client";

import { useState } from "react";
import { ChevronDown, Clock, User, Zap, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowCardView } from "@/lib/business-brain/workflow-view";

interface WorkflowCardProps {
  workflow: WorkflowCardView;
  /** First workflow in its group opens by default for scannability. */
  defaultOpen?: boolean;
}

const PRIORITY_STRIPE: Record<string, string> = {
  critical: "bg-[#DC2626]",
  high: "bg-[#EA580C]",
  medium: "bg-[#CA8A04]",
  low: "bg-[#65A30D]",
};

const OWNER_ICON_STYLE: Record<string, string> = {
  dentist: "text-[#7C3AED]",
  receptionist: "text-[#0891B2]",
  either: "text-[#71717A]",
};

/**
 * A single workflow execution card.
 *
 * Top section (always visible): title, owner, effort, timeframe.
 * Expanded section: step-by-step tasks + expected outcome.
 *
 * The card answers:
 *   What?   → title
 *   Why?    → reason (shown inline, brief)
 *   Who?    → owner badge
 *   When?   → timeframe badge
 *   How?    → tasks (on expand)
 *   Result? → expected outcome (on expand)
 */
export function WorkflowCard({ workflow, defaultOpen = false }: WorkflowCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden flex">
      <div
        className={cn("w-1 shrink-0", PRIORITY_STRIPE[workflow.prioritySeverity] ?? PRIORITY_STRIPE.low)}
        aria-hidden
      />

      <div className="flex-1 min-w-0">
        {/* Header: always visible */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full text-left px-5 py-4 hover:bg-[#FAFAFA] transition-colors cursor-pointer"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-[#09090B] leading-snug">
                {workflow.title}
              </h4>
              <p className="text-xs text-[#71717A] mt-1 leading-relaxed">
                {workflow.reason}
              </p>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-[#A1A1AA] shrink-0 mt-0.5 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </div>

          {/* Meta badges */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className={cn("inline-flex items-center gap-1 text-xs font-medium", OWNER_ICON_STYLE[workflow.ownerIcon])}>
              <User className="h-3 w-3" aria-hidden />
              {workflow.ownerLabel}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-[#52525B]">
              <Clock className="h-3 w-3" aria-hidden />
              {workflow.timeframeLabel}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-[#52525B]">
              <Zap className="h-3 w-3" aria-hidden />
              {workflow.effortLabel}
            </span>
            <span className="text-xs text-[#A1A1AA]">
              {workflow.taskCount} {workflow.taskCount === 1 ? "step" : "steps"}
            </span>
          </div>
        </button>

        {/* Expanded: tasks + outcome */}
        {open && (
          <div className="px-5 pb-5 animate-fade-in">
            <div className="border-t border-[#F4F4F5] pt-4">
              {/* Tasks */}
              <ol className="space-y-2.5">
                {workflow.tasks.map((task) => (
                  <li key={task.id} className="flex gap-3">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-[#F4F4F5] text-[10px] font-semibold text-[#52525B] flex items-center justify-center mt-0.5">
                      {task.order}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-[#09090B] leading-relaxed">
                        {task.instruction}
                      </p>
                      {task.hint && (
                        <p className="text-xs text-[#A1A1AA] mt-0.5 italic">
                          {task.hint}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              {/* Expected outcome */}
              <div className="mt-4 pt-3 border-t border-[#F4F4F5] flex items-start gap-2">
                <Target className="h-3.5 w-3.5 text-[#16A34A] shrink-0 mt-0.5" aria-hidden />
                <p className="text-xs text-[#52525B] leading-relaxed">
                  <span className="font-medium text-[#09090B]">Expected outcome:</span>{" "}
                  {workflow.outcomeDescription}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
