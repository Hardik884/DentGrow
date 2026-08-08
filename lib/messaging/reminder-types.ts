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
  /** Plain reason this patient is being contacted, e.g. "Planned: Root canal". */
  readonly reason: string;
  /** The template filled with this patient's details, ready to review and send. */
  readonly message: string;
}

export interface WhatsAppSendList {
  /** The page of recipients requested (all of them when no paging is asked for). */
  readonly recipients: readonly WhatsAppRecipient[];
  /** Total actionable patients for this kind — the number to send, before paging. */
  readonly total: number;
}

/** Per-kind counts for the briefing: everyone with the problem, and how many we can message. */
export interface ReminderSummary {
  readonly kind: ActionDraftKind;
  /** Distinct patients with the underlying problem, reachable or not. */
  readonly total: number;
  /** Reachable patients not already reminded — the WhatsApp count and send-list length. */
  readonly actionable: number;
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
