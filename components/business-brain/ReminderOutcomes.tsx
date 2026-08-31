import { History } from "lucide-react";
import type { ReminderOutcome } from "@/lib/business-brain/reminder-outcomes";
import { RESPONSE_WINDOW_DAYS } from "@/lib/business-brain/reminder-outcomes";

/**
 * A look back at whether the reminders the clinic sent led anywhere.
 *
 * Every other panel on this page is about what to do next. This is the only one
 * that reports on what already happened, and it exists so the reminder workflow
 * can be judged rather than taken on faith.
 *
 * ## The wording is the safeguard
 *
 * "have since paid" — not "were recovered by the reminder", not a conversion
 * rate, not an uplift. Nothing here can tell whether the patient would have paid
 * anyway, so nothing here claims to. The footnote says so in plain words rather
 * than leaving the reader to infer it, because the causal reading is the
 * comfortable one and it would be wrong.
 */
const LABEL: Record<string, { reminded: string; acted: string }> = {
  payment_reminder: { reminded: "reminded about a balance", acted: "have since paid something" },
  recall_invitation: { reminded: "invited back for a check-up", acted: "have since booked" },
  treatment_plan_follow_up: {
    reminded: "contacted about planned treatment",
    acted: "have since booked",
  },
};

export function ReminderOutcomes({ outcomes }: { outcomes: readonly ReminderOutcome[] }) {
  // Nothing to say until at least one cohort has had its full window. Rendering
  // an empty shell would imply the clinic has done nothing, when the truth is
  // usually that its reminders are too recent to judge.
  const shown = outcomes.filter((o) => o.reminded > 0 && LABEL[o.kind]);
  if (shown.length === 0) return null;

  return (
    <section className="bg-surface border border-border rounded-xl">
      <div className="px-5 py-3.5 border-b border-surface-muted flex items-center gap-2">
        <History className="h-3.5 w-3.5 text-text-disabled" aria-hidden />
        <h2 className="text-sm font-semibold text-text-primary">
          Did your reminders go anywhere?
        </h2>
      </div>
      <ul className="px-5 py-3 space-y-2">
        {shown.map((o) => {
          const label = LABEL[o.kind];
          return (
            <li key={o.kind} className="text-sm text-text-body">
              <span className="font-semibold text-text-primary tabular-nums">
                {o.acted} of {o.reminded}
              </span>{" "}
              <span className="text-text-secondary">
                patients {label.reminded} {label.acted}.
              </span>
            </li>
          );
        })}
      </ul>
      <p className="px-5 pb-4 text-[11px] text-text-disabled leading-relaxed">
        Counts patients whose reminder was sent at least {RESPONSE_WINDOW_DAYS} days ago, so
        everyone counted has had time to respond. Some would have come back anyway &mdash; this
        shows what followed a reminder, not what the reminder caused.
      </p>
    </section>
  );
}
