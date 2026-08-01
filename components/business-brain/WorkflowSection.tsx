"use client";

import { ClipboardList } from "lucide-react";
import type { WorkflowGroupView, WorkflowSummary } from "@/lib/business-brain/workflow-view";
import { WorkflowCard } from "./WorkflowCard";

interface WorkflowSectionProps {
  groups: readonly WorkflowGroupView[];
  summary: WorkflowSummary;
}

/**
 * The Workflow section of the Business Brain dashboard.
 *
 * This answers the final question in the chain:
 *   What is happening? → (status + focus cards)
 *   Why? → (diagnoses)
 *   What should I do? → (strategies in focus cards)
 *   How do I do it? → THIS SECTION
 *
 * Grouped by timeframe because a clinic owner's first question when they see
 * a list of tasks is "what do I need to do NOW?" — not "which category is
 * this?" Categories are already answered by the focus cards above.
 */
export function WorkflowSection({ groups, summary }: WorkflowSectionProps) {
  if (summary.totalCount === 0) return null;

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[#52525B]" aria-hidden />
            <h2 className="text-sm font-semibold text-[#09090B]">What to do about it</h2>
          </div>
          <p className="text-xs text-[#71717A] mt-0.5">
            Step-by-step guides for the problems found above.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {summary.todayCount > 0 && (
            <span className="text-xs font-medium text-[#EA580C] bg-[#FFF7ED] px-2 py-1 rounded">
              {summary.todayCount} for today
            </span>
          )}
          <span className="text-xs text-[#71717A]">
            ~{formatMinutes(summary.totalEstimatedMinutes)} in total
          </span>
        </div>
      </div>

      {/* Grouped workflows */}
      {groups.map((group) => (
        <div key={group.label} className="space-y-2">
          <h3 className="text-xs font-semibold text-[#52525B] uppercase tracking-wider pl-1">
            {group.label}
          </h3>
          <div className="space-y-2">
            {group.workflows.map((workflow, i) => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                // Open the first workflow in the "Today" group by default.
                defaultOpen={group.label === "Today" && i === 0}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}
