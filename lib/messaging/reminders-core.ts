/**
 * lib/messaging/reminders-core.ts
 *
 * The pure heart of reminder-population building — no DB, no session, no I/O — so
 * the rules that decide who gets a reminder can be tested directly with
 * constructed rows.
 *
 * These are the exact transforms actions/messaging.ts applies after fetching:
 *   - dedupeByPatientId — one row per patient, never per treatment/follow-up.
 *   - buildReachable     — keep only patients we can actually message, attach the
 *                          filled text, and mark whether each was already sent.
 *   - nextUnsentIndex    — the "who's next to contact" cursor the focused
 *                          one-patient-at-a-time workflow walks.
 *
 * Keeping them here means the "16 said, 7 shown" class of bug — two code paths
 * counting different things — cannot come back, because the count and the list
 * are the same function of the same input.
 */

import { isSendableReminder } from "./eligibility";
import type { WhatsAppRecipient } from "./reminder-types";

/** One distinct patient behind a reminder, before reachability filters. */
export interface Candidate {
  readonly patientId: string;
  readonly name: string;
  readonly phone: string | null;
  /** The specific thing this is about, e.g. a treatment name or "Follow-up". */
  readonly subject: string;
  /** Plain reason this patient is being contacted, e.g. "No next visit booked". */
  readonly reason: string;
  /** Patient-specific template fields; clinic fields are merged in when filling. */
  readonly vars: Record<string, string>;
}

/**
 * Keep the first row for each distinct patient id, dropping rows with no id.
 * Order is preserved, so a caller that sorts oldest-first keeps the oldest row
 * per patient. This is what turns "one row per follow-up/treatment" into "one
 * row per patient".
 */
export function dedupeByPatientId<T>(
  rows: readonly T[],
  getId: (row: T) => string | null | undefined,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = getId(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

/**
 * Turn distinct-patient candidates into the recipients we can actually reach:
 *   - drop anyone who has withdrawn consent to be contacted,
 *   - fill each message,
 *   - drop anyone we cannot message or whose message still has {{markers}},
 *   - mark whether they were already reminded for this kind inside the cooldown.
 *
 * Unlike a plain "who's left" filter, this keeps the already-sent patients in the
 * list (flagged), so the focused workflow can show honest progress — "7 of 16
 * contacted" — and let a user page back over the ones already done.
 *
 * WHY OPT-OUT IS A REMOVAL AND NOT A FLAG
 *   `alreadySent` patients stay in the list because the workflow needs to show
 *   progress over them. A patient who has withdrawn consent is different: there
 *   is no progress to show and nothing a staff member should do next. Leaving
 *   them visible with a "do not contact" badge would put a message one
 *   mis-click away from being sent to someone who asked not to receive it, and
 *   the wa.me handoff means the send is a human action this application cannot
 *   intercept. So they are removed before a message is ever composed for them.
 */
export function buildReachable(
  candidates: readonly Candidate[],
  remindedRecently: ReadonlySet<string>,
  fill: (vars: Record<string, string>) => string,
  /**
   * Patients who have withdrawn communications consent. Optional and empty by
   * default so every existing caller keeps its meaning, but actions/messaging.ts
   * always supplies it.
   */
  optedOut: ReadonlySet<string> = new Set(),
): WhatsAppRecipient[] {
  const out: WhatsAppRecipient[] = [];
  for (const c of candidates) {
    // Checked FIRST, before the message is even filled: a message that is never
    // composed cannot be sent by accident.
    if (optedOut.has(c.patientId)) continue;

    const message = fill(c.vars);
    if (!isSendableReminder(c.phone, message)) continue;
    out.push({
      patientId: c.patientId,
      name: c.name,
      phone: c.phone,
      subject: c.subject,
      reason: c.reason,
      message,
      alreadySent: remindedRecently.has(c.patientId),
    });
  }
  return out;
}

/**
 * The index of the next patient still to contact, searching forward from `from`
 * and wrapping once, or null when everyone is done. `sent` is the set of patient
 * ids already handled (persisted sends plus this session's). This is the cursor
 * the workflow advances after a send or a skip.
 */
export function nextUnsentIndex(
  recipients: readonly { patientId: string }[],
  sent: ReadonlySet<string>,
  from: number,
): number | null {
  const n = recipients.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    if (!sent.has(recipients[i].patientId)) return i;
  }
  return null;
}

/** The first patient still to contact, or null when all are done. */
export function firstUnsentIndex(
  recipients: readonly { patientId: string }[],
  sent: ReadonlySet<string>,
): number | null {
  for (let i = 0; i < recipients.length; i++) {
    if (!sent.has(recipients[i].patientId)) return i;
  }
  return null;
}
