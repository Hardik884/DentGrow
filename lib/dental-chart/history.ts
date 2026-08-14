/**
 * lib/dental-chart/history.ts
 *
 * Shared tooth_history writer, mirroring lib/appointments/history.ts exactly.
 *
 * The tooth_history table has NO client write RLS policy (see migration
 * 20260814000000_dental_chart.sql), so every insert must go through the
 * service-role client. actions/dental-chart.ts is the sole caller.
 *
 * History write failures are non-fatal — they are logged but never block the
 * underlying mutation, matching writeAppointmentHistory's behaviour.
 */

import { createClient } from "@supabase/supabase-js";

export type ToothHistoryAction =
  | "status_changed"
  | "condition_updated"
  | "note_added"
  | "treatment_linked";

export async function writeToothHistory(row: {
  patientToothId: string;
  action: ToothHistoryAction;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  performedBy: string | null;
  treatmentId?: string | null;
}): Promise<void> {
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await serviceClient.from("tooth_history").insert({
    patient_tooth_id: row.patientToothId,
    action: row.action,
    old_value: row.oldValue ?? null,
    new_value: row.newValue ?? null,
    performed_by: row.performedBy,
    treatment_id: row.treatmentId ?? null,
  });

  if (error) {
    console.error("[writeToothHistory]", error);
  }
}
