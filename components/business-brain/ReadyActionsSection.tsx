"use client";

import { MousePointerClick } from "lucide-react";
import type { ActionPlanView, ActionSummary } from "@/lib/business-brain/action-view";
import { ActionPlanCard } from "./ActionPlanCard";

interface ReadyActionsSectionProps {
  plans: readonly ActionPlanView[];
  summary: ActionSummary;
}

/**
 * The last section of the Business Brain dashboard.
 *
 *   What is happening?      → status banner
 *   Why?                    → focus cards
 *   What should I do?       → strategies, inside the focus cards
 *   How should I do it?     → execution plan (workflows)
 *   Do it with fewer clicks → THIS SECTION
 *
 * Kept as one flat, ordered list rather than grouped by category. The plans
 * already arrive in the Workflow Engine's order — worst problem first, most
 * urgent first — and grouping by category would scatter that ordering across
 * seven headings, which is the opposite of "start here".
 */
export function ReadyActionsSection({ plans, summary }: ReadyActionsSectionProps) {
  if (summary.planCount === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-[#52525B]" aria-hidden />
            <h2 className="text-sm font-semibold text-[#09090B]">Ready actions</h2>
          </div>
          <p className="text-xs text-[#71717A] mt-0.5">
            Screens already filtered and messages already written. Nothing here is sent — every
            action waits for you.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {summary.preparedCount > 0 && (
            <span className="text-xs font-medium text-[#15803D] bg-[#F0FDF4] px-2 py-1 rounded">
              {summary.preparedCount} one-click
            </span>
          )}
          {summary.draftCount > 0 && (
            <span className="text-xs text-[#71717A]">{summary.draftCount} drafts</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {plans.map((plan, i) => (
          <ActionPlanCard key={plan.id} plan={plan} defaultOpen={i === 0} />
        ))}
      </div>
    </section>
  );
}
