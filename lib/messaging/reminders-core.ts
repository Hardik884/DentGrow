/**
 * lib/messaging/reminders-core.ts
 *
 * The pure heart of reminder-population building — no DB, no session, no I/O — so
 * the rules that decide who gets a reminder can be tested directly with
 * constructed rows.
 *
 * These are the exact transforms actions/messaging.ts applies after fetching:
 *   - dedupeByPatientId — one row per patient, never per treatment/follow-up.
 *   - buildActionable    — keep only patients we can actually message and have
 *                          not just messaged, and attach the filled text.
 *
 * Keeping them here means the "16 said, 7 shown" class of bug — two code paths
 * counting different things — cannot come back, because the count and the list
 * are the same function of the same input.
 */

import { isSendableReminder } from "./eligibility";

/** One distinct patient behind a reminder, before reachability/cooldown filters. */
export interface Candidate {
  readonly patientId: string;
  readonly name: string;
  readonly phone: string | null;
  /** Plain reason this patient is being contacted, e.g. "Planned: Root canal". */
  readonly reason: string;
  /** Patient-specific template fields; clinic fields are merged in when filling. */
  readonly vars: Record<string, string>;
}

/** A patient ready to message: reachable, not recently reminded, text filled. */
export interface ActionableRecipient {
  readonly patientId: string;
  readonly name: string;
  readonly phone: string | null;
  readonly reason: string;
  readonly message: string;
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
 * Turn distinct-patient candidates into the recipients we can actually send:
 *   - skip anyone reminded for this kind inside the cooldown (`remindedRecently`),
 *   - fill each message,
 *   - skip anyone we cannot reach or whose message still has {{markers}}.
 *
 * The returned length is the actionable count. Because the briefing's number and
 * the send list are both derived from this one function over the same
 * candidates, they are always equal.
 */
export function buildActionable(
  candidates: readonly Candidate[],
  remindedRecently: ReadonlySet<string>,
  fill: (vars: Record<string, string>) => string,
): ActionableRecipient[] {
  const out: ActionableRecipient[] = [];
  for (const c of candidates) {
    if (remindedRecently.has(c.patientId)) continue;
    const message = fill(c.vars);
    if (!isSendableReminder(c.phone, message)) continue;
    out.push({
      patientId: c.patientId,
      name: c.name,
      phone: c.phone,
      reason: c.reason,
      message,
    });
  }
  return out;
}
