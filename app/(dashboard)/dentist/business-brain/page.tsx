import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { resolveSession } from "@/lib/auth/session";
import { isBusinessBrainEnabled } from "@/lib/feature-flags";
import { runDashboardBrain } from "@/lib/business-brain/dashboard-data";
import { computeClinicHealth } from "@/lib/business-brain/clinic-health";
import { buildBriefing } from "@/lib/business-brain/briefing-view";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { MorningBriefing } from "@/components/business-brain/MorningBriefing";

export const metadata: Metadata = {
  title: "Morning Briefing",
};

/**
 * /dentist/business-brain — the Morning Briefing.
 *
 * One job: a busy dentist understands their clinic, and what to do about it,
 * within a minute of opening this page. Three things, in order:
 *
 *   1. Clinic Health   — one number, one word, and what's behind it.
 *   2. Needs attention — the problems, worst first, in plain language.
 *   3. What to do       — a checklist and the buttons to act on each one.
 *
 * Everything the old page showed around this — metrics walls, coverage lines,
 * confidence labels, the pipeline audit trail — is gone. None of it helped a
 * dentist decide anything before their first patient.
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
      <PageShell subtitle="Your daily clinic check-up">
        <div className="bg-white border border-[#E4E4E7] rounded-xl">
          <EmptyState
            icon={<AlertTriangle className="h-5 w-5" />}
            title="Couldn't check your clinic today"
            description="Something went wrong reading your records. Everything else in DentGrow still works — try refreshing in a minute."
          />
        </div>
      </PageShell>
    );
  }

  const { result, date } = run;
  const health = computeClinicHealth(result.metrics);
  const { problems, actions } = buildBriefing(result, result.metrics);

  return (
    <PageShell subtitle={formatDate(date)}>
      <MorningBriefing health={health} problems={problems} actions={actions} />
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
        <h1 className="text-xl font-semibold text-[#09090B] tracking-tight">Morning Briefing</h1>
        <p className="text-sm text-[#71717A] mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
