"use client";

import { CheckCircle2 } from "lucide-react";
import type { ClinicHealth } from "@/lib/business-brain/clinic-health";
import type { ActionCardView, ProblemView } from "@/lib/business-brain/briefing-view";
import type { ReminderSummary } from "@/lib/messaging/reminder-types";
import { HealthMeter } from "./HealthMeter";
import { ProblemCard } from "./ProblemCard";
import { ActionCard } from "./ActionCard";

interface MorningBriefingProps {
  health: ClinicHealth;
  problems: readonly ProblemView[];
  actions: readonly ActionCardView[];
  /** When true, action cards may offer an inline "Contact Patients" button. */
  whatsappEnabled?: boolean;
  /** Per-kind reminder counts from the server, matched onto each card by its messageKind. */
  reminderSummaries?: readonly ReminderSummary[];
}

/**
 * The whole page below the title: the health score, then two paired columns.
 *
 * The score, problems and actions are always the server's live truth. Nothing
 * here removes a problem or its action on interaction — a card leaves only when
 * the underlying issue is genuinely resolved and the page re-reads fresh data.
 * Ticking a checklist or sending a reminder is progress, not proof.
 *
 * Problems and actions are rendered as PAIRED ROWS (one problem beside the
 * action that resolves it), not as two independently-scrolling lists. Every
 * row's two cards share a height via CSS Grid's default row-stretch, so the
 * two "columns" always end at exactly the same point — with no per-card
 * height hacks and no huge artificial empty space, since only genuine pairs
 * stretch to match each other. On narrow screens each row collapses to a
 * single column (problem, then its action, then the next pair), which also
 * reads better than two separate long lists: cause and fix stay together.
 *
 * "Patients to contact" is no longer a separate section here — each relevant
 * action card now carries its own inline Contact Patients action (see
 * ActionCard), so the patient-contact workflow lives inside the
 * recommendation it belongs to instead of a disconnected module.
 */
export function MorningBriefing({
  health,
  problems,
  actions,
  whatsappEnabled = false,
  reminderSummaries = [],
}: MorningBriefingProps) {
  const allClear = problems.length === 0;
  const actionByProblemId = new Map(actions.map((a) => [a.problemId, a]));
  const summaryByKind = whatsappEnabled ? new Map(reminderSummaries.map((s) => [s.kind, s])) : null;

  return (
    <div className="space-y-6">
      <HealthMeter health={health} />

      {allClear ? (
        <div className="bg-surface border border-border rounded-xl px-6 py-10 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-success-bg mb-3">
            <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
          </div>
          <h2 className="text-base font-semibold text-text-primary">Everything looks good today</h2>
          <p className="text-sm text-text-secondary mt-1">
            Nothing needs your attention right now. Your clinic is running as expected.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Column headers stay side-by-side on every screen size — short
              enough to fit even on a narrow phone, and they anchor the two
              "columns" conceptually even though the rows below are paired. */}
          <div className="grid grid-cols-2 gap-x-4 lg:gap-x-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-text-primary">Needs attention</h2>
              <span className="text-xs text-text-disabled">{problems.length}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-text-primary">What to do</h2>
              <span className="text-xs text-text-disabled">{actions.length}</span>
            </div>
          </div>

          <div className="space-y-3">
            {problems.map((p) => {
              const action = actionByProblemId.get(p.id);
              const contactSummary =
                summaryByKind && action?.messageKind ? summaryByKind.get(action.messageKind) : undefined;
              return (
                <div key={p.id} className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-6 items-stretch">
                  <ProblemCard problem={p} />
                  {action ? (
                    <ActionCard action={action} contactSummary={contactSummary} />
                  ) : (
                    <div aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
