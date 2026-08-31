/**
 * lib/business-brain/reminder-outcomes.ts
 *
 * Did the reminders the clinic actually sent lead anywhere?
 *
 * Every stage of the Business Brain up to now stops at "here is what to do".
 * Nothing has ever looked back to ask whether doing it worked. This is the first
 * piece that closes that loop, deliberately narrow: it covers only the one action
 * OraMedha already records the completion of — a staff member confirming they
 * sent a WhatsApp reminder (`reminder_logs`) — and asks whether the thing the
 * reminder was about has since happened.
 *
 * ## This measures CORRELATION and says so
 *
 * A patient who paid after a payment reminder may well have paid anyway. Nothing
 * here can separate the two, and it does not pretend to: the numbers are
 * presented as "reminded, and has since paid", never "the reminder caused the
 * payment". That wording is the whole safeguard, and it is why this file returns
 * plain counts rather than anything called a conversion or an uplift — a number
 * with those names invites exactly the causal reading the data cannot support.
 *
 * ## Two honesty rules baked into the arithmetic
 *
 * 1. **Only reminders that have had their full window are counted.** A reminder
 *    sent yesterday has not "failed" — nobody has had time to respond. Counting
 *    it as unanswered would drag every rate down and make an effective process
 *    look broken, worst of all right after a big send. So eligibility is
 *    `sentAt <= now - responseWindowDays`, and recent reminders are excluded from
 *    both halves of the fraction rather than counted as misses.
 *
 * 2. **Patients are counted, not reminder rows.** A patient reminded three times
 *    over two months is one patient, judged from their EARLIEST eligible
 *    reminder. Counting rows would let one stubborn patient look like three
 *    failures, and would double-count a success the moment a second reminder
 *    happened to precede a payment that answered the first.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { ActionDraftKind } from "@/business-brain";

/** How long a patient gets to respond before a reminder counts as unanswered. */
export const RESPONSE_WINDOW_DAYS = 14;

/** How far back to look for reminders worth judging. */
export const LOOKBACK_DAYS = 90;

/** What counts as the patient having acted, per reminder kind. */
const RESPONSE_KIND: Partial<Record<string, "payment" | "booking">> = {
  [ActionDraftKind.PAYMENT_REMINDER]: "payment",
  [ActionDraftKind.RECALL_INVITATION]: "booking",
  [ActionDraftKind.TREATMENT_PLAN_FOLLOW_UP]: "booking",
  // appointment_confirmation and standby_slot_offer are deliberately absent:
  // neither has an outcome this schema records. A confirmation is answered by
  // the patient simply turning up, and attendance is not linked back to the
  // message; a standby offer is answered by a booking that is indistinguishable
  // from any other. Guessing at either would invent a measurement.
};

export interface ReminderOutcome {
  readonly kind: string;
  /** Distinct patients reminded whose response window has fully elapsed. */
  readonly reminded: number;
  /** Of those, how many have since done the thing the reminder was about. */
  readonly acted: number;
}

export interface ReminderOutcomeInput {
  readonly reminders: readonly { patientId: string; kind: string; sentAt: string }[];
  /** ISO timestamps of payments, per patient. */
  readonly paymentsByPatient: ReadonlyMap<string, readonly string[]>;
  /** ISO timestamps of appointment CREATION (booking moment), per patient. */
  readonly bookingsByPatient: ReadonlyMap<string, readonly string[]>;
  /** Logical now, injected so this stays a pure function. */
  readonly now: string;
  readonly responseWindowDays?: number;
}

/**
 * Pure outcome arithmetic. No I/O, no clock — `now` is supplied, exactly like
 * every engine in `business-brain/`, so the result is reproducible and testable.
 */
export function computeReminderOutcomes(input: ReminderOutcomeInput): readonly ReminderOutcome[] {
  const windowDays = input.responseWindowDays ?? RESPONSE_WINDOW_DAYS;
  const nowMs = Date.parse(input.now);
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  // Earliest eligible reminder per (patient, kind). Earliest, not latest: the
  // patient's first fair chance to respond is the honest reference point, and
  // taking the latest would silently forgive every reminder that came before it.
  const earliest = new Map<string, { patientId: string; kind: string; sentMs: number }>();
  for (const r of input.reminders) {
    const sentMs = Date.parse(r.sentAt);
    if (Number.isNaN(sentMs)) continue;
    // Not yet had its full window — excluded entirely, never counted as a miss.
    if (sentMs > nowMs - windowMs) continue;

    const key = `${r.patientId}|${r.kind}`;
    const existing = earliest.get(key);
    if (existing === undefined || sentMs < existing.sentMs) {
      earliest.set(key, { patientId: r.patientId, kind: r.kind, sentMs });
    }
  }

  const byKind = new Map<string, { reminded: number; acted: number }>();
  for (const { patientId, kind, sentMs } of earliest.values()) {
    const responseKind = RESPONSE_KIND[kind];
    if (responseKind === undefined) continue;

    const events =
      responseKind === "payment"
        ? input.paymentsByPatient.get(patientId)
        : input.bookingsByPatient.get(patientId);

    // Strictly after the reminder, and inside the window. An event that predates
    // the reminder obviously did not follow from it; one long after it is not
    // something this window can claim either way.
    const acted = (events ?? []).some((iso) => {
      const at = Date.parse(iso);
      return !Number.isNaN(at) && at > sentMs && at <= sentMs + windowMs;
    });

    const bucket = byKind.get(kind) ?? { reminded: 0, acted: 0 };
    bucket.reminded += 1;
    if (acted) bucket.acted += 1;
    byKind.set(kind, bucket);
  }

  return [...byKind.entries()]
    .map(([kind, v]) => ({ kind, reminded: v.reminded, acted: v.acted }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

/**
 * Read the clinic's reminder history and the events that might answer it.
 *
 * Never throws: this is a retrospective nicety, not something the briefing
 * depends on. On any failure the caller gets an empty list and the strip simply
 * does not render — losing a look-back must never cost a dentist the page.
 */
export async function readReminderOutcomes(
  db: SupabaseClient<Database>,
  clinicId: string,
  now: string,
): Promise<readonly ReminderOutcome[]> {
  try {
    const since = new Date(Date.parse(now) - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: reminderRows, error: reminderError } = await db
      .from("reminder_logs")
      .select("patient_id, kind, sent_at")
      .eq("clinic_id", clinicId)
      .gte("sent_at", since);
    if (reminderError || !reminderRows || reminderRows.length === 0) return [];

    const patientIds = [...new Set(reminderRows.map((r) => r.patient_id))];

    // Only the two event types any reminder kind can be answered by, scoped to
    // the reminded patients and the look-back window.
    const [payments, bookings] = await Promise.all([
      db
        .from("payments")
        .select("patient_id, created_at")
        .eq("clinic_id", clinicId)
        .is("deleted_at", null)
        .in("patient_id", patientIds)
        .gte("created_at", since),
      db
        .from("appointments")
        .select("patient_id, created_at")
        .eq("clinic_id", clinicId)
        .is("deleted_at", null)
        .in("patient_id", patientIds)
        .gte("created_at", since),
    ]);

    const group = (
      rows: readonly { patient_id: string; created_at: string }[] | null,
    ): Map<string, string[]> => {
      const map = new Map<string, string[]>();
      for (const row of rows ?? []) {
        const list = map.get(row.patient_id) ?? [];
        list.push(row.created_at);
        map.set(row.patient_id, list);
      }
      return map;
    };

    return computeReminderOutcomes({
      reminders: reminderRows.map((r) => ({
        patientId: r.patient_id,
        kind: r.kind,
        sentAt: r.sent_at,
      })),
      paymentsByPatient: group(payments.data),
      bookingsByPatient: group(bookings.data),
      now,
    });
  } catch {
    return [];
  }
}
