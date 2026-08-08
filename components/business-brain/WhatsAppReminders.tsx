"use client";

import { useState } from "react";
import { MessageCircle, ArrowRight, Check } from "lucide-react";
import type { ActionDraftKind } from "@/business-brain";
import type { ReminderSummary } from "@/lib/messaging/reminder-types";
import { WhatsAppContactWorkflow } from "./WhatsAppContactWorkflow";

/** Plain, human title per reminder kind — no Business Brain terminology. */
const KIND_TITLE: Record<string, string> = {
  recall_invitation: "Patient follow-ups",
  payment_reminder: "Payment reminders",
  treatment_plan_follow_up: "Planned treatment",
};

function titleFor(kind: ActionDraftKind): string {
  return KIND_TITLE[kind] ?? "Patient reminders";
}

/**
 * The compact WhatsApp summary in the Morning Briefing.
 *
 * It answers only "who needs contacting", never "what do I say" — one small row
 * per reminder kind with a count and progress, and a single "Review patients"
 * action. All the messages, editing and sending live in the focused
 * one-patient-at-a-time workflow this opens, so the briefing stays light.
 */
export function WhatsAppReminders({ summaries }: { summaries: readonly ReminderSummary[] }) {
  // The kind whose focused workflow is open, or null.
  const [openKind, setOpenKind] = useState<ActionDraftKind | null>(null);
  // Patients confirmed sent this session, per kind — bumps progress live without
  // a page reload (the send itself is already persisted server-side).
  const [sentByKind, setSentByKind] = useState<Record<string, Set<string>>>({});

  const rows = summaries.filter((s) => s.reachableTotal > 0);
  if (rows.length === 0) return null;

  return (
    <section className="bg-white border border-[#E4E4E7] rounded-xl">
      <div className="flex items-center gap-2 px-6 pt-5 pb-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F0FDF4]">
          <MessageCircle className="h-4 w-4 text-[#16A34A]" aria-hidden />
        </span>
        <h2 className="text-sm font-semibold text-[#09090B]">Patients to contact</h2>
      </div>

      <div className="divide-y divide-[#F4F4F5]">
        {rows.map((s) => {
          const extra = sentByKind[s.kind]?.size ?? 0;
          const contacted = Math.min(s.reachableTotal, s.contacted + extra);
          const done = contacted >= s.reachableTotal;
          const people = s.reachableTotal === 1 ? "patient" : "patients";
          return (
            <div key={s.kind} className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#09090B]">{titleFor(s.kind)}</p>
                <p className="text-sm text-[#71717A] mt-0.5">
                  {done ? (
                    <span className="inline-flex items-center gap-1 text-[#15803D]">
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                      All {s.reachableTotal} {people} contacted
                    </span>
                  ) : (
                    <>
                      {s.reachableTotal} {people} to contact
                      {contacted > 0 && (
                        <span className="text-[#A1A1AA]"> · {contacted} / {s.reachableTotal} contacted</span>
                      )}
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenKind(s.kind)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] text-[#18181B] px-3.5 py-2 text-sm font-medium hover:bg-[#FAFAFA] transition-colors cursor-pointer shrink-0"
              >
                {done ? "Review" : "Review patients"}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>

      {openKind && (
        <WhatsAppContactWorkflow
          kind={openKind}
          title={titleFor(openKind)}
          open={openKind != null}
          onClose={() => setOpenKind(null)}
          onSent={(patientId) =>
            setSentByKind((prev) => {
              const next = { ...prev };
              const set = new Set(next[openKind] ?? []);
              set.add(patientId);
              next[openKind] = set;
              return next;
            })
          }
        />
      )}
    </section>
  );
}
