import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { resolveSession } from "@/lib/auth/session";
import { isBusinessBrainEnabled } from "@/lib/feature-flags";
import { runDashboardBrain } from "@/lib/business-brain/dashboard-data";
import { buildDashboardView } from "@/lib/business-brain/dashboard-view";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { BrainStatusBanner } from "@/components/business-brain/BrainStatusBanner";
import { SignalList } from "@/components/business-brain/SignalList";
import { DiagnosisList } from "@/components/business-brain/DiagnosisList";
import { MetricGrid } from "@/components/business-brain/MetricGrid";
import { RunDetails } from "@/components/business-brain/RunDetails";

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
 *   2. What needs attention?   -> signals
 *   3. Why is it happening?    -> diagnoses
 *   4. What are the numbers?   -> metrics
 *   5. Can I trust this?       -> run details (collapsed)
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

      <Section
        title="What deserves attention"
        description="Measurements that crossed a threshold today."
      >
        <SignalList groups={view.signalGroups} />
      </Section>

      <Section
        title="Why this is happening"
        description="Observations that correlate, with the explanations the evidence supports and rules out."
      >
        <DiagnosisList
          diagnoses={view.diagnoses}
          signalDescriptions={result.signals.map((s) => s.description)}
        />
      </Section>

      <Section title="The numbers" description="Every measurement taken for this day.">
        <MetricGrid groups={view.metricGroups} />
      </Section>

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
