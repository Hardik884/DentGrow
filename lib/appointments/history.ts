/**
 * lib/appointments/history.ts
 *
 * Shared appointment_history writer.
 *
 * The appointment_history table has NO client write RLS policy, so every
 * insert must go through the service-role client. Both actions/appointments.ts
 * and the shared completion workflow (lib/appointments/complete.ts) reuse this
 * single helper so audit rows are written identically from every path.
 *
 * History write failures are non-fatal — they are logged but never block the
 * underlying mutation.
 */

import { createClient } from "@supabase/supabase-js";

export type AppointmentHistoryAction =
  | "created"
  | "rescheduled"
  | "cancelled"
  | "status_changed";

export async function writeAppointmentHistory(row: {
  appointmentId: string;
  action: AppointmentHistoryAction;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  performedBy: string | null;
}): Promise<void> {
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await serviceClient.from("appointment_history").insert({
    appointment_id: row.appointmentId,
    action: row.action,
    old_value: row.oldValue ?? null,
    new_value: row.newValue ?? null,
    performed_by: row.performedBy,
  });

  if (error) {
    console.error("[writeAppointmentHistory]", error);
  }
}
