"use client";

import { useState } from "react";
import { MessageCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionDraftKind } from "@/business-brain";
import { WhatsAppSendList } from "./WhatsAppSendList";

/** Plain-language heading per message kind, for the sub-sections. */
const KIND_LABEL: Record<string, string> = {
  recall_invitation: "Overdue recall reminders",
  payment_reminder: "Payment reminders",
  treatment_plan_follow_up: "Next-visit reminders",
};

/**
 * The full-width WhatsApp section, sitting between the health score and the two
 * columns. One collapsible sub-section per reminder type that today's problems
 * call for. Each opens a per-patient send list DentGrow prepares — the staff
 * member reviews each message and sends it themselves.
 *
 * Only the reminder types tied to a current problem appear here, so this is
 * never a generic outreach tool — it is exactly the messages this morning needs.
 */
export function WhatsAppReminders({ kinds }: { kinds: readonly ActionDraftKind[] }) {
  // Open the first section by default; the rest are one click away (and only
  // fetch their list when opened).
  const [open, setOpen] = useState<ActionDraftKind | null>(kinds[0] ?? null);

  if (kinds.length === 0) return null;

  return (
    <section className="bg-white border border-[#E4E4E7] rounded-xl">
      <div className="flex items-center gap-2 px-6 pt-5 pb-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F0FDF4]">
          <MessageCircle className="h-4 w-4 text-[#16A34A]" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[#09090B]">WhatsApp reminders</h2>
          <p className="text-xs text-[#71717A]">
            Prepared for you — review each message and send it yourself.
          </p>
        </div>
      </div>

      <div className="px-6 pb-5 pt-2 divide-y divide-[#F4F4F5]">
        {kinds.map((kind) => {
          const isOpen = open === kind;
          return (
            <div key={kind} className="py-1">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : kind)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-3 py-2 text-left cursor-pointer"
              >
                <span className="text-sm font-medium text-[#09090B]">
                  {KIND_LABEL[kind] ?? "Reminders"}
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 text-[#A1A1AA] shrink-0 transition-transform", isOpen && "rotate-180")}
                  aria-hidden
                />
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
