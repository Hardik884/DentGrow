/**
 * lib/messaging/reminder-types.ts
 *
 * Shared shapes and constants for the WhatsApp reminder system. Kept out of the
 * "use server" action file because a server-action module may export only async
 * functions — types and constants live here so both the actions and the client
 * components can import them.
 */

import type { ActionDraftKind } from "@/business-brain";

export interface WhatsAppRecipient {
  readonly patientId: string;
  readonly name: string;
  /** Raw stored number; the client sanitises it for the wa.me link. Always reachable here. */
  readonly phone: string | null;
  /** The specific thing this is about, e.g. "Root Canal" or "Follow-up". */
  readonly subject: string;
  /** Plain reason this patient is being contacted, e.g. "No next visit booked". */
  readonly reason: string;
  /** The template filled with this patient's details, ready to review and send. */
  readonly message: string;
  /** True when this patient was already reminded for this kind inside the cooldown. */
  readonly alreadySent: boolean;
}

export interface WhatsAppSendList {
  /** The page of recipients requested (all reachable patients when no paging is asked for). */
  readonly recipients: readonly WhatsAppRecipient[];
  /** Total reachable patients for this kind — the workflow length, before paging. */
  readonly total: number;
}

/** Per-kind counts for the briefing summary card and the focused workflow. */
export interface ReminderSummary {
  readonly kind: ActionDraftKind;
  /** Distinct patients with the underlying problem, reachable or not (left card). */
  readonly total: number;
  /** Distinct patients we can message — the "N to contact" the workflow walks. */
  readonly reachableTotal: number;
  /** Of the reachable set, how many have already been contacted (X of N). */
  readonly contacted: number;
}

/** The three message kinds the Morning Briefing prepares. */
export const ALLOWED_KINDS: readonly ActionDraftKind[] = [
  "recall_invitation",
  "payment_reminder",
  "treatment_plan_follow_up",
];

/**
 * Days a patient is left off a kind's list after they were reminded for it. Long
 * enough that a page refresh (or the next morning) never re-offers the same
 * message; short enough that a still-unresolved problem resurfaces for a gentle
 * second nudge rather than being forgotten.
 */
export const REMINDER_COOLDOWN_DAYS = 7;
