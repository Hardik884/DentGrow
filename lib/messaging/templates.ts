/**
 * lib/messaging/templates.ts
 *
 * Single source for the patient message templates: the ones the Business Brain's
 * action catalog already defines. We read them straight from the catalog rather
 * than copy the wording, so there is exactly one place the message text lives —
 * the engine that was built to hold it. The app's only job is to fill the
 * {{markers}} with real data and hand the result to a human to send.
 */

import { ACTION_CATALOG, type ActionDraftKind } from "@/business-brain";

export interface MessageTemplate {
  readonly subject?: string;
  /** The message body, with {{marker}} placeholders left for the app to fill. */
  readonly body: string;
}

/**
 * The template for a given draft kind, or null if the catalog has none.
 * Matched on the draft's own kind, so no capability-id mapping to keep in sync.
 */
export function messageTemplateFor(kind: ActionDraftKind): MessageTemplate | null {
  for (const capability of ACTION_CATALOG.values()) {
    if (capability.draft?.kind === kind) {
      return { subject: capability.draft.subject, body: capability.draft.body };
    }
  }
  return null;
}

/**
 * The three message kinds the Morning Briefing's send lists use, one per
 * messageable problem category. Appointment-confirmation and standby-slot-offer
 * exist in the catalog too but are driven from other surfaces, not these cards.
 */
export const BRIEFING_MESSAGE_KINDS = {
  retention: "recall_invitation",
  revenue_leakage: "payment_reminder",
  treatment_acceptance: "treatment_plan_follow_up",
} as const satisfies Record<string, ActionDraftKind>;

export type MessageableCategory = keyof typeof BRIEFING_MESSAGE_KINDS;
