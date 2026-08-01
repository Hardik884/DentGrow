import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { resolveSession } from "@/lib/auth/session";
import { isBusinessBrainEnabled } from "@/lib/feature-flags";
import { runDashboardBrain } from "@/lib/business-brain/dashboard-data";
import {
  buildDashboardView,
  buildFocusCards,
  headlineMetrics,
} from "@/lib/business-brain/dashboard-view";
import { buildWorkflowGroups } from "@/lib/business-brain/workflow-view";
import { buildActionPlanViews } from "@/lib/business-brain/action-view";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { BrainStatusBanner } from "@/components/business-brain/BrainStatusBanner";
import { FocusCard } from "@/components/business-brain/FocusCard";
import { RunDetails } from "@/components/business-brain/RunDetails";
import { AllNumbers } from "@/components/business-brain/AllNumbers";

export const metadata: Metadata = {
  title: "Business Brain",
};

/**
 * /dentist/business-brain
 *
 * Redesigned for clarity: a busy dentist should understand the page in 30 seconds.
 *
 * Page structure answers four questions, in order:
 *   1. Is my clinic healthy today?   → Status banner with headline numbers
 *   2. What are my biggest problems? → Focus cards (worst first)
 *   3. What should I do first?       → Primary action on each card
 *   4. Can I act immediately?        → Action button on each card
 *
 * Everything else (full metrics, workflows, audit trail) is available on demand
 * but never competes with the morning briefing.
 */
export default async function BusinessBrainPage() {
  const { profile } = await resolveSession();

  if (!profile || profile.role !== "dentist") notFound();
  if (!isBusinessBrainEnabled(profile.clinic_id)) notFound();

  let run: Awaited<ReturnType<typeof runDashboardBrain>>;
  try {
    run = await runDashboardBrain();
  } catch {
    return (
      <PageShell subtitle="Deterministic clinic analysis">
        <div className="bg-white border border-[#E4E4E7] rounded-xl">
          <EmptyState
            icon={<AlertTriangle className="h-5 w-5" />}
            title="Analysis could not run"
            description="Your clinic records could not be read just now. Nothing else in DentGrow is affected — try again shortly."
          />
        </div>
      </PageShell>
    );
  }

  const { result, date } = run;
  const view = buildDashboardView(result);
  const focus = buildFocusCards(result);
  const signalDescriptions = result.signals.map((s) => s.description);
  const headline = headlineMetrics(result.metrics);

  // Build workflow and action data to attach to focus cards
  const workflowGroups = buildWorkflowGroups(result.workflows);
  const actionPlans = buildActionPlanViews(result.actionPlans, "dentist");

  // Signals not explained by any focus card — shown in Run Details, not on the main page.
  const explainedSignalIds = new Set(
    focus.flatMap((card) => card.diagnoses.flatMap((d) => d.signalIds)),
  );
  const looseEnds = result.signals.filter((s) => !explainedSignalIds.has(s.id));

  if (!result.ok) {
    return (
      <PageShell subtitle={`Analysis for ${formatDate(date)}`}>
        <div className="bg-white border border-[#E4E4E7] rounded-xl">
          <EmptyState
            icon={<AlertTriangle className="h-5 w-5" />}
            title="Analysis stopped partway"
            description="Some of today's data could not be processed. Nothing else in DentGrow is affected."
          />
        </div>
        <RunDetails execution={result.execution} unmeasured={view.unmeasured} looseSignals={looseEnds} />
      </PageShell>
    );
  }

  return (
    <PageShell subtitle={`Analysis for ${formatDate(date)}`}>
      {/* Section 1: Am I okay today? + key numbers */}
      <BrainStatusBanner
        status={view.status}
        measuredCount={view.measuredCount}
        unmeasuredCount={view.unmeasured.length}
        confidence={result.execution.stages.find((s) => s.stage === "signals")?.confidence}
        headline={headline}
      />

      {/* Section 2: Problems, worst first. Each card contains the problem,
          the strategy, and the action — everything a dentist needs to decide
          and act, without scrolling to a separate section. */}
      {focus.length > 0 && (
        <div className="space-y-3">
          {focus.map((card, i) => (
            <FocusCard
              key={card.id}
              card={card}
              signalDescriptions={signalDescriptions}
              defaultOpen={i === 0}
              // Attach the matching workflow and action plan to each card
              workflows={workflowGroups.flatMap((g) => g.workflows).filter(
                (w) => w.constraintId === card.id
              )}
              actionPlan={actionPlans.find((p) =>
                workflowGroups.flatMap((g) => g.workflows)
                  .filter((w) => w.constraintId === card.id)
                  .some((w) => w.id === p.workflowId)
              ) ?? null}
            />
          ))}
        </div>
      )}

      {/* Section 3: Full metrics — available on demand */}
      <AllNumbers
        headline={headline}
        groups={view.metricGroups}
        measuredCount={view.measuredCount}
      />

      {/* Section 4: Audit trail — collapsed */}
      <RunDetails execution={result.execution} unmeasured={view.unmeasured} looseSignals={looseEnds} />
    </PageShell>
  );
}

function PageShell({
  subtitle,
  children,
}: {
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-xl font-semibold text-[#09090B] tracking-tight">Business Brain</h1>
        <p className="text-sm text-[#71717A] mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
