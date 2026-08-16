/**
 * lib/consents/history.ts
 *
 * Shared consent_audit writer, mirroring lib/dental-chart/history.ts exactly.
 *
 * The consent_audit table has NO client write RLS policy (see migration
 * 20260816000000_patient_consent_forms.sql), so every insert must go through
 * the service-role client. actions/consents.ts is the sole caller.
 *
 * Audit write failures are non-fatal — logged but never block the underlying
 * mutation, matching writeAppointmentHistory / writeToothHistory.
 */

import { createClient } from "@supabase/supabase-js";

export type ConsentAuditAction =
  | "created"
  | "updated"
  | "status_changed"
  | "signed"
  | "cancelled"
  | "uploaded";

export async function writeConsentAudit(row: {
  consentId: string;
  clinicId: string;
  action: ConsentAuditAction;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  performedBy: string | null;
}): Promise<void> {
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await serviceClient.from("consent_audit").insert({
    consent_id: row.consentId,
    clinic_id: row.clinicId,
    action: row.action,
    old_value: row.oldValue ?? null,
    new_value: row.newValue ?? null,
    performed_by: row.performedBy,
  });

  if (error) {
    console.error("[writeConsentAudit]", error);
  }
}
