"use client";

import { CheckCircle2 } from "lucide-react";
import type { ActionDraftKind } from "@/business-brain";
import type { ClinicHealth } from "@/lib/business-brain/clinic-health";
import type { ActionCardView, ProblemView } from "@/lib/business-brain/briefing-view";
import { HealthMeter } from "./HealthMeter";
import { WhatsAppReminders } from "./WhatsAppReminders";
import { ProblemCard } from "./ProblemCard";
import { ActionCard } from "./ActionCard";

interface MorningBriefingProps {
  health: ClinicHealth;
  problems: readonly ProblemView[];
  actions: readonly ActionCardView[];
  /** When true, the WhatsApp reminders section is shown for messageable problems. */
  whatsappEnabled?: boolean;
}

/**
 * The whole page below the title: the health score, then (when relevant) the
 * WhatsApp reminders, then two columns.
 *
 * The score, problems and actions are always the server's live truth. Nothing
 * here removes a problem or its action on interaction — a card leaves only when
 * the underlying issue is genuinely resolved and the page re-reads fresh data.
 * Ticking a checklist or sending a reminder is progress, not proof.
 */
export function MorningBriefing({ health, problems, actions, whatsappEnabled = false }: MorningBriefingProps) {
  const allClear = problems.length === 0;

  // The reminder types today's problems call for — distinct, in the order the
  // action cards appear. Only shown for clinics with the flag on.
  const messageKinds: ActionDraftKind[] = whatsappEnabled
    ? Array.from(
        new Set(actions.map((a) => a.messageKind).filter((k): k is ActionDraftKind => Boolean(k))),
      )
    : [];

  return (
    <div className="space-y-6">
      <HealthMeter health={health} />

      {messageKinds.length > 0 && <WhatsAppReminders kinds={messageKinds} />}

      {allClear ? (
        <div className="bg-white border border-[#E4E4E7] rounded-xl px-6 py-10 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#F0FDF4] mb-3">
            <CheckCircle2 className="h-5 w-5 text-[#16A34A]" aria-hidden />
          </div>
          <h2 className="text-base font-semibold text-[#09090B]">Everything looks good today</h2>
          <p className="text-sm text-[#71717A] mt-1">
            Nothing needs your attention right now. Your clinic is running as expected.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Problems */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-[#09090B]">Needs attention</h2>
              <span className="text-xs text-[#A1A1AA]">{problems.length}</span>
            </div>
            {problems.map((p) => (
              <ProblemCard key={p.id} problem={p} />
            ))}
          </div>

          {/* Right: Actions */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-[#09090B]">What to do</h2>
              <span className="text-xs text-[#A1A1AA]">{actions.length}</span>
            </div>
            {actions.map((a) => (
              <ActionCard key={a.id} action={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
