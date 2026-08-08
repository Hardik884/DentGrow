"use client";

import { useState } from "react";
import { MessageCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionDraftKind } from "@/business-brain";
import { WhatsAppSendList } from "./WhatsAppSendList";

export interface ReminderAction {
  readonly kind: ActionDraftKind;
  /** Patients we can message for this kind — equals the send list's length. */
  readonly count: number;
}

/** The plain, count-led label a dentist reads for each action. */
function actionLabel(kind: ActionDraftKind, count: number): string {
  const people = count === 1 ? "patient" : "patients";
  switch (kind) {
    case "recall_invitation":
      return `Follow up with ${count} ${people}`;
    case "payment_reminder":
      return `Remind ${count} ${people} about payment`;
    case "treatment_plan_follow_up":
      return `Contact ${count} ${people} about planned treatment`;
    default:
      return `Message ${count} ${people}`;
  }
}

/**
 * "Today's Actions" — the WhatsApp work for the morning, grouped by kind.
 *
 * Each row is one action in plain language ("Follow up with 5 patients") with an
 * Open control; opening it reveals that action's individual patients. The count
 * is the number of patients we can actually message (reachable, not already
 * reminded), so it matches exactly what opens beneath it — no more "16 said,
 * 7 shown".
 *
 * Only actions with someone to contact are shown, so this is never busywork —
 * it is exactly the messages this morning needs.
 */
export function WhatsAppReminders({ actions }: { actions: readonly ReminderAction[] }) {
  const rows = actions.filter((a) => a.count > 0);
  // Independent open/close; the list is short (at most a few actions).
  const [open, setOpen] = useState<Set<ActionDraftKind>>(new Set());

  if (rows.length === 0) return null;

  function toggle(kind: ActionDraftKind) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  return (
    <section className="bg-white border border-[#E4E4E7] rounded-xl">
      <div className="flex items-center gap-2 px-6 pt-5 pb-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F0FDF4]">
          <MessageCircle className="h-4 w-4 text-[#16A34A]" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[#09090B]">Today&apos;s actions</h2>
          <p className="text-xs text-[#71717A]">
            Prepared for you — review each message and send it yourself on WhatsApp.
          </p>
        </div>
      </div>

      <div className="px-6 pb-5 pt-2 divide-y divide-[#F4F4F5]">
        {rows.map(({ kind, count }) => {
          const isOpen = open.has(kind);
          return (
            <div key={kind} className="py-1">
              <button
                type="button"
                onClick={() => toggle(kind)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-3 py-2 text-left cursor-pointer group"
              >
                <span className="text-sm font-medium text-[#09090B]">{actionLabel(kind, count)}</span>
                <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[#15803D] shrink-0">
                  {isOpen ? "Close" : "Open"}
                  <ChevronDown
                    className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
                    aria-hidden
                  />
                </span>
              </button>
              {isOpen && (
                <div className="pb-3 pt-1 animate-fade-in">
                  <WhatsAppSendList kind={kind} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
