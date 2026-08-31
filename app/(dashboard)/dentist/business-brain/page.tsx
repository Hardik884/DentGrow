import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { resolveSession } from "@/lib/auth/session";
import { isBusinessBrainEnabled, isWhatsAppEnabled } from "@/lib/feature-flags";
import { runDashboardBrain } from "@/lib/business-brain/dashboard-data";
import { computeClinicHealth } from "@/lib/business-brain/clinic-health";
import { buildBriefing } from "@/lib/business-brain/briefing-view";
import { readActiveDismissals, isSuppressed } from "@/lib/business-brain/dismissals";
import { readReminderOutcomes } from "@/lib/business-brain/reminder-outcomes";
import { ReminderOutcomes } from "@/components/business-brain/ReminderOutcomes";
import { createServerClient } from "@/lib/supabase/server";
import { getReminderSummaries } from "@/actions/messaging";
import type { ReminderSummary } from "@/lib/messaging/reminder-types";
import { BRIEFING_MESSAGE_KINDS } from "@/lib/messaging/templates";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { MorningBriefing } from "@/components/business-brain/MorningBriefing";

export const metadata: Metadata = {
  title: "Actions",
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
        <div className="bg-surface border border-border rounded-xl">
          <EmptyState
            icon={<AlertTriangle className="h-5 w-5" />}
            title="Couldn't check your clinic today"
            description="Something went wrong reading your records. Everything else in OraMedha still works — try refreshing in a minute."
          />
        </div>
      </PageShell>
    );
  }

  const { result, date } = run;
  const whatsappEnabled = isWhatsAppEnabled(profile.clinic_id);

  // The distinct-patient reminder populations. `total` (patients with the
  // problem) aligns the plain problem counts on the left; `actionable` (patients
  // we can message, not already reminded) drives the WhatsApp actions and equals
  // each send list's length. Both come from one source so the numbers agree.
  const reminderSummaries: ReminderSummary[] = whatsappEnabled
    ? (await getReminderSummaries()).data ?? []
    : [];

  // Map kind → category so the projection can state distinct-patient counts.
  const kindToCategory = Object.fromEntries(
    Object.entries(BRIEFING_MESSAGE_KINDS).map(([category, kind]) => [kind, category]),
  ) as Record<string, string>;
  const patientCounts: Record<string, number> = {};
  for (const s of reminderSummaries) {
    const category = kindToCategory[s.kind];
    if (category) patientCounts[category] = s.total;
  }

  // The health breakdown shares the same distinct-patient counts, so its
  // "N patients" lines match the problem cards and the action list rather than
  // inflating to a treatment/follow-up row count.
  const health = computeClinicHealth(result.metrics, {
    patientCounts: {
      noNextVisit: patientCounts["treatment_acceptance"] ?? null,
      overdueFollowups: patientCounts["retention"] ?? null,
    },
  });

  // Problems the clinic has snoozed and that have not since got worse. Resolved
  // here rather than inside the projection: it needs the database, and the
  // escalation check needs each constraint's CURRENT severity, so this is the
  // only place that has both. A read failure yields an empty set, which shows
  // everything — the safe direction.
  const supabase = await createServerClient();
  const dismissals = await readActiveDismissals(
    supabase as never,
    profile.clinic_id,
    new Date().toISOString(),
  );
  const suppressedCategories = new Set(
    result.constraints
      .filter((c) => isSuppressed(dismissals.get(c.category), c.severity))
      .map((c) => c.category),
  );

  const { problems, actions } = buildBriefing(
    result,
    result.metrics,
    patientCounts,
    suppressedCategories,
  );

  // Only meaningful where reminders can actually be sent, so it shares the
  // WhatsApp gate rather than appearing as an empty panel for clinics that have
  // never had the affordance.
  const reminderOutcomes = whatsappEnabled
    ? await readReminderOutcomes(supabase as never, profile.clinic_id, new Date().toISOString())
    : [];

  return (
    <PageShell subtitle={formatDate(date)}>
      <MorningBriefing
        health={health}
        problems={problems}
        actions={actions}
        whatsappEnabled={whatsappEnabled}
        reminderSummaries={reminderSummaries}
      />
      {/* Last, and deliberately: the page's job is what to do today. This is a
          look back, useful but never the headline. */}
      <ReminderOutcomes outcomes={reminderOutcomes} />
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
    <div className="p-6 lg:p-8 space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Actions</h1>
        <p className="text-sm text-text-secondary mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
