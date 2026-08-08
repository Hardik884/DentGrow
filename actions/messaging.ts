"use server";

import { z } from "zod";
import type { ActionDraftKind } from "@/business-brain";
import type { ActionResult } from "@/types";
import { resolveSession } from "@/lib/auth/session";
import { isWhatsAppEnabled } from "@/lib/feature-flags";
import { messageTemplateFor } from "@/lib/messaging/templates";
import { fillTemplate } from "@/lib/messaging/whatsapp";
import { buildActionable, dedupeByPatientId, type Candidate } from "@/lib/messaging/reminders-core";
import {
  ALLOWED_KINDS,
  REMINDER_COOLDOWN_DAYS,
  type ReminderSummary,
  type WhatsAppRecipient,
  type WhatsAppSendList,
} from "@/lib/messaging/reminder-types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getOverdueFollowUps } from "@/actions/follow-ups";
import { getPatientsWithOutstandingBalance } from "@/actions/payments";
import { getPatientsWithPlannedTreatmentNoVisit } from "@/actions/treatments";
import { getClinicSettings } from "@/actions/clinic-settings";

/**
 * actions/messaging.ts
 *
 * The single source of truth for who receives a WhatsApp reminder.
 *
 * Every reminder kind resolves to ONE deduplicated, clinic-scoped population of
 * patients built here. The count the Morning Briefing shows ("Contact 12
 * patients") and the list a staff member opens are computed from that same
 * population, so they can never disagree — the old "16 said, 7 shown" gap came
 * from two code paths measuring different things (treatment rows vs. distinct
 * patients).
 *
 * Three filters are applied, in order, server-side:
 *   1. Distinct patients — one row per patient, never per treatment/follow-up.
 *   2. Reachable — a patient with no usable phone is dropped, because DentGrow
 *      cannot build a WhatsApp message for them. The underlying clinic problem
 *      stays on its own screen, reachable by other means.
 *   3. Not already reminded — a patient contacted for this kind inside the
 *      cooldown window is suppressed, so a refresh never re-offers a message the
 *      staff already sent.
 *
 * It only prepares. Nothing here sends a message. The staff member sends each
 * one by hand via the wa.me link the UI builds, then confirms it — which writes
 * a reminder_logs row through markReminderSent, closing filter (3).
 */

/** A near-term date to suggest in follow-up messages. Editable before sending. */
function suggestedDate(): string {
  return formatDate(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
}

/** The distinct-patient population for a kind — deduped, one row per patient. */
async function candidatesFor(kind: ActionDraftKind): Promise<Candidate[]> {
  if (kind === "recall_invitation") {
    const list = (await getOverdueFollowUps()).data ?? [];
    // Ordered oldest-overdue first, so the row kept per patient is the one that
    // has been waiting longest. One reminder per patient, never per follow-up.
    return dedupeByPatientId(list, (f) => f.patient?.id)
      .filter((f) => f.patient)
      .map((f) => ({
        patientId: f.patient!.id,
        name: f.patient!.name,
        phone: f.patient!.phone,
        reason: `Follow-up due ${formatDate(new Date(f.due_date))}`,
        vars: { patient_name: f.patient!.name, suggested_date: suggestedDate() },
      }));
  }

  if (kind === "payment_reminder") {
    const list = (await getPatientsWithOutstandingBalance()).data ?? [];
    return list.map((p) => ({
      patientId: p.id,
      name: p.name,
      phone: p.phone,
      reason: `${formatCurrency(p.balance)} outstanding`,
      vars: { patient_name: p.name, amount_outstanding: formatCurrency(p.balance) },
    }));
  }

  // treatment_plan_follow_up
  const list = (await getPatientsWithPlannedTreatmentNoVisit()).data ?? [];
  return list.map((p) => ({
    patientId: p.id,
    name: p.name,
    phone: p.phone,
    reason: `Planned: ${p.treatment_type}`,
    vars: {
      patient_name: p.name,
      treatment_name: p.treatment_type,
      suggested_date: suggestedDate(),
    },
  }));
}

/**
 * The full computed picture for one kind: the total distinct-patient population,
 * and the actionable recipients (reachable, not recently reminded, message
 * filled and valid). Both public entry points read from here so a count and a
 * list are always the same population.
 *
 * Returns null when the caller is not allowed to see WhatsApp data at all.
 */
async function buildReminderData(
  kind: ActionDraftKind,
): Promise<{ total: number; actionable: WhatsAppRecipient[] } | null> {
  const { db, profile } = await resolveSession();
  if (!profile || profile.role === "patient") return null;
  if (!isWhatsAppEnabled(profile.clinic_id)) return null;

  const template = messageTemplateFor(kind);
  if (!template) return null;

  const candidates = await candidatesFor(kind);
  const total = candidates.length;
  if (total === 0) return { total, actionable: [] };

  // Patients already reminded for this kind inside the cooldown — suppressed so a
  // refresh does not re-offer a message the staff member has already sent.
  const since = new Date(Date.now() - REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: logs } = await db
    .from("reminder_logs")
    .select("patient_id")
    .eq("clinic_id", profile.clinic_id)
    .eq("kind", kind)
    .gte("sent_at", since);
  const remindedRecently = new Set(
    ((logs ?? []) as { patient_id: string }[]).map((l) => l.patient_id),
  );

  const settings = (await getClinicSettings()).data;
  const clinicVars = {
    clinic_name: settings?.clinic_name ?? "our clinic",
    clinic_phone: settings?.phone ?? "the clinic",
  };

  // Reachable, not recently reminded, message filled and free of {{markers}} —
  // never generate a broken action. The list length here is the actionable count.
  const actionable = buildActionable(candidates, remindedRecently, (vars) =>
    fillTemplate(template.body, { ...clinicVars, ...vars }),
  );

  return { total, actionable };
}

/**
 * The send list for one kind. `recipients` is the actionable population (paged if
 * asked), and `total` is its full length, so the UI can show "showing 20 of 63"
 * and load more without ever silently dropping a patient.
 */
export async function getWhatsAppSendList(
  kind: ActionDraftKind,
  paging?: { limit?: number; offset?: number },
): Promise<ActionResult<WhatsAppSendList>> {
  try {
    if (!ALLOWED_KINDS.includes(kind)) {
      return { data: null, error: "Unsupported message type." };
    }
    const data = await buildReminderData(kind);
    if (!data) return { data: null, error: "WhatsApp reminders are not available." };

    const offset = Math.max(0, paging?.offset ?? 0);
    const recipients =
      paging?.limit != null
        ? data.actionable.slice(offset, offset + Math.max(0, paging.limit))
        : data.actionable;

    return { data: { recipients, total: data.actionable.length }, error: null };
  } catch (err) {
    console.error("[getWhatsAppSendList] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

/**
 * Counts for every messageable kind, for the briefing. `total` drives the plain
 * problem count on the left ("14 patients have planned treatment"); `actionable`
 * drives the WhatsApp action on the right ("Contact 12 patients") and equals the
 * length of that kind's send list.
 */
export async function getReminderSummaries(): Promise<ActionResult<ReminderSummary[]>> {
  try {
    const { profile } = await resolveSession();
    if (!profile || profile.role === "patient") return { data: null, error: "Forbidden" };
    if (!isWhatsAppEnabled(profile.clinic_id)) return { data: [], error: null };

    const summaries: ReminderSummary[] = [];
    for (const kind of ALLOWED_KINDS) {
      const data = await buildReminderData(kind);
      if (!data) continue;
      summaries.push({ kind, total: data.total, actionable: data.actionable.length });
    }
    return { data: summaries, error: null };
  } catch (err) {
    console.error("[getReminderSummaries] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

const markSentSchema = z.object({
  kind: z.enum(["recall_invitation", "payment_reminder", "treatment_plan_follow_up"]),
  patientId: z.string().uuid(),
});

/**
 * Record that a staff member sent this patient the reminder for `kind`. Writes a
 * reminder_logs row (clinic-scoped by RLS), which removes the patient from the
 * kind's list for the cooldown window — this is what makes "Mark as sent"
 * survive a refresh instead of being ephemeral client state.
 */
export async function markReminderSent(
  kind: ActionDraftKind,
  patientId: string,
): Promise<ActionResult<null>> {
  try {
    const parsed = markSentSchema.safeParse({ kind, patientId });
    if (!parsed.success) return { data: null, error: "Invalid input." };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role === "patient") return { data: null, error: "Forbidden" };
    if (!isWhatsAppEnabled(profile.clinic_id)) {
      return { data: null, error: "WhatsApp reminders are not enabled for this clinic." };
    }

    const { error } = await db.from("reminder_logs").insert({
      clinic_id: profile.clinic_id,
      patient_id: parsed.data.patientId,
      kind: parsed.data.kind,
      sent_by: profile.id,
    });
    if (error) {
      console.error("[markReminderSent]", error);
      return { data: null, error: "Couldn't record the reminder." };
    }
    return { data: null, error: null };
  } catch (err) {
    console.error("[markReminderSent] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
