"use server";

import type { ActionDraftKind } from "@/business-brain";
import type { ActionResult } from "@/types";
import { resolveSession } from "@/lib/auth/session";
import { isWhatsAppEnabled } from "@/lib/feature-flags";
import { messageTemplateFor } from "@/lib/messaging/templates";
import { fillTemplate } from "@/lib/messaging/whatsapp";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getOverdueFollowUps } from "@/actions/follow-ups";
import { getPatientsWithOutstandingBalance } from "@/actions/payments";
import { getPatientsWithPlannedTreatmentNoVisit } from "@/actions/treatments";
import { getClinicSettings } from "@/actions/clinic-settings";

/**
 * actions/messaging.ts
 *
 * Assembles a "send list" for a WhatsApp reminder: the message text (from the
 * Business Brain's own catalog, single-sourced) filled with each patient's real
 * details, plus the raw phone number, for one problem category.
 *
 * It only prepares. Nothing here sends a message or writes a record — the staff
 * member sends each one by hand via the wa.me link the UI builds. The read is
 * clinic-scoped from the session and gated behind the WhatsApp allow-list.
 */

export interface WhatsAppRecipient {
  readonly patientId: string;
  readonly name: string;
  /** Raw stored number; the client sanitises it for the wa.me link. */
  readonly phone: string | null;
  /** The template filled with this patient's details, ready to review and send. */
  readonly message: string;
}

export interface WhatsAppSendList {
  readonly recipients: readonly WhatsAppRecipient[];
}

/** The three message kinds the Morning Briefing prepares. */
const ALLOWED_KINDS: readonly ActionDraftKind[] = [
  "recall_invitation",
  "payment_reminder",
  "treatment_plan_follow_up",
];

/** A near-term date to suggest in recall / follow-up messages. Editable before sending. */
function suggestedDate(): string {
  return formatDate(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
}

export async function getWhatsAppSendList(
  kind: ActionDraftKind,
): Promise<ActionResult<WhatsAppSendList>> {
  try {
    if (!ALLOWED_KINDS.includes(kind)) {
      return { data: null, error: "Unsupported message type." };
    }

    const { profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role === "patient") return { data: null, error: "Forbidden" };
    if (!isWhatsAppEnabled(profile.clinic_id)) {
      return { data: null, error: "WhatsApp reminders are not enabled for this clinic." };
    }

    const template = messageTemplateFor(kind);
    if (!template) return { data: null, error: "Message template not found." };

    const settings = (await getClinicSettings()).data;
    const clinicVars = {
      clinic_name: settings?.clinic_name ?? "our clinic",
      clinic_phone: settings?.phone ?? "the clinic",
    };

    const fill = (vars: Record<string, string>): string => fillTemplate(template.body, vars);

    const recipients: WhatsAppRecipient[] = [];

    if (kind === "recall_invitation") {
      const list = (await getOverdueFollowUps()).data ?? [];
      const seen = new Set<string>();
      for (const f of list) {
        const p = f.patient;
        if (!p || seen.has(p.id)) continue;
        seen.add(p.id);
        recipients.push({
          patientId: p.id,
          name: p.name,
          phone: p.phone,
          message: fill({
            ...clinicVars,
            patient_name: p.name,
            suggested_date: suggestedDate(),
          }),
        });
      }
    } else if (kind === "payment_reminder") {
      const list = (await getPatientsWithOutstandingBalance()).data ?? [];
      for (const p of list) {
        recipients.push({
          patientId: p.id,
          name: p.name,
          phone: p.phone,
          message: fill({
            ...clinicVars,
            patient_name: p.name,
            amount_outstanding: formatCurrency(p.balance),
          }),
        });
      }
    } else {
      const list = (await getPatientsWithPlannedTreatmentNoVisit()).data ?? [];
      for (const p of list) {
        recipients.push({
          patientId: p.id,
          name: p.name,
          phone: p.phone,
          message: fill({
            ...clinicVars,
            patient_name: p.name,
            treatment_name: p.treatment_type,
            suggested_date: suggestedDate(),
          }),
        });
      }
    }

    return { data: { recipients }, error: null };
  } catch (err) {
    console.error("[getWhatsAppSendList] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
