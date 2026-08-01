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
import { buildWorkflowGroups, buildWorkflowSummary } from "@/lib/business-brain/workflow-view";
import { buildActionPlanViews, buildActionSummary } from "@/lib/business-brain/action-view";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { BrainStatusBanner } from "@/components/business-brain/BrainStatusBanner";
import { FocusCard } from "@/components/business-brain/FocusCard";
import { SignalList } from "@/components/business-brain/SignalList";
import { TodaysNumbers } from "@/components/business-brain/TodaysNumbers";
import { RunDetails } from "@/components/business-brain/RunDetails";
import { WorkflowSection } from "@/components/business-brain/WorkflowSection";
import { ReadyActionsSection } from "@/components/business-brain/ReadyActionsSection";

export const metadata: Metadata = {
  title: "Business Brain",
};

/**
 * /dentist/business-brain
 *
 * Deterministic clinic analysis: Metrics -> Signals -> Diagnosis.
 *
 * Gated to the development clinic by an explicit allow-list. A clinic that is
 * not listed gets a 404 rather than a redirect, so the route does not reveal
 * that the feature exists.
 *
 * Page order answers the questions in the order a dentist asks them:
 *   1. Am I OK today?          -> status banner
 *   2. What needs attention,
 *      and why?                -> focus cards (signals + diagnoses + strategy)
 *   3. How do I do it?         -> execution plan (workflows)
 *   4. Just do it for me       -> ready actions (prepared screens and drafts)
 *   5. What are the numbers?   -> metrics
 *   6. Can I trust this?       -> run details (collapsed)
 */
export default async function BusinessBrainPage() {
  const { profile } = await resolveSession();

  // Role and clinic gate. Both are UX; RLS remains the security boundary.
  if (!profile || profile.role !== "dentist") notFound();
  if (!isBusinessBrainEnabled(profile.clinic_id)) notFound();

  let run: Awaited<ReturnType<typeof runDashboardBrain>>;
  try {
    run = await runDashboardBrain();
  } catch {
    // The pipeline is analysis, never a clinical dependency — a failure here
    // must degrade to a message rather than break the page.
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
  const workflowGroups = buildWorkflowGroups(result.workflows);
  const workflowSummary = buildWorkflowSummary(result.workflows);
  // Hrefs are built for the dentist because this page is dentist-only. An action
  // owned by the receptionist still links to the dentist's route — the person
  // reading the page is the one clicking.
  const actionPlans = buildActionPlanViews(result.actionPlans, "dentist");
  const actionSummary = buildActionSummary(result.actionPlans);

  // Signals that no focus card already explains.
  //
  // Filtered down to the individual signal, not merely "is anything ungrouped".
  // The looser version re-listed EVERY signal underneath the cards, so a dentist
  // read "5 appointments lost" in a card and then met the cancellation rate and
  // no-show rate again as separate items below — the same problem told twice in
  // two vocabularies, which is the thing this page was restructured to stop.
  const explainedSignalIds = new Set(
    focus.flatMap((card) => card.diagnoses.flatMap((d) => d.signalIds)),
  );
  const looseEnds = result.signals.filter((s) => !explainedSignalIds.has(s.id));
  const looseEndGroups = view.signalGroups
    .map((g) => ({ ...g, signals: g.signals.filter((s) => !explainedSignalIds.has(s.id)) }))
    .filter((g) => g.signals.length > 0);

  // A stage rejected its input. Show what did complete rather than nothing.
  if (!result.ok) {
    return (
      <PageShell subtitle={`Analysis for ${formatDate(date)}`}>
        <div className="bg-white border border-[#E4E4E7] rounded-xl">
          <EmptyState
            icon={<AlertTriangle className="h-5 w-5" />}
            title="Analysis stopped partway"
            description="Some of today's data could not be processed, so the results below would be incomplete. Nothing else in DentGrow is affected."
          />
        </div>
        <RunDetails execution={result.execution} unmeasured={view.unmeasured} />
      </PageShell>
    );
  }

  return (
    <PageShell subtitle={`Analysis for ${formatDate(date)}`}>
      <BrainStatusBanner
        status={view.status}
        measuredCount={view.measuredCount}
        unmeasuredCount={view.unmeasured.length}
        confidence={result.execution.stages.find((s) => s.stage === "signals")?.confidence}
      />

      {/* One card per problem, worst first. This replaced separate "signals"
          and "diagnoses" sections, which described the same problem twice in two
          vocabularies and left the reader to work out they were one thing. */}
      {focus.length > 0 && (
        <div className="space-y-3">
          {focus.map((card, i) => (
            <FocusCard
              key={card.id}
              card={card}
              signalDescriptions={signalDescriptions}
              // The top problem opens its reasoning; the rest stay folded, so
              // the page is scannable before it is readable.
              defaultOpen={i === 0}
            />
          ))}
        </div>
      )}

      {/* Workflows: structured execution plans for each strategy.
          Placed between the problems and the supporting data: the dentist has
          already seen WHAT is wrong (focus cards), and now sees HOW to fix it
          before diving into the numbers. */}
      <WorkflowSection groups={workflowGroups} summary={workflowSummary} />

      {/* The final output of the Business Brain: the same plans, reduced to
          clicks. Placed directly under the execution plan because it is the same
          work — a workflow says what to do, the action does the navigating and
          the typing. Nothing here executes; every action prepares. */}
      <ReadyActionsSection plans={actionPlans} summary={actionSummary} />

      {/* Figures outside their usual range that did not group into any problem.
          Kept visible because hiding them would overstate how much the page
          understands, and kept SEPARATE because the engine cannot say what they
          mean — presenting them alongside explained problems would imply it can. */}
      {looseEnds.length > 0 && (
        <Section
          title="Other figures worth a look"
          description="These were outside their usual range but do not point to any of the areas above."
        >
          <SignalList groups={looseEndGroups} />
        </Section>
      )}

      <TodaysNumbers
        headline={headlineMetrics(result.metrics)}
        groups={view.metricGroups}
        measuredCount={view.measuredCount}
      />

      <RunDetails execution={result.execution} unmeasured={view.unmeasured} />
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

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[#09090B]">{title}</h2>
        <p className="text-xs text-[#71717A] mt-0.5">{description}</p>
      </div>
      {children}
    </section>
  );
}
