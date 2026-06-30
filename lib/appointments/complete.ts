/**
 * lib/appointments/complete.ts
 *
 * THE single authoritative appointment-completion workflow.
 *
 * Every code path that completes an appointment MUST call
 * completeAppointmentCascade() so the side effects happen exactly once and
 * stay consistent regardless of where completion originates:
 *
 *   - actions/appointments.ts → updateAppointmentStatus (dentist controls)
 *   - actions/queue.ts        → advanceQueue ("Call Next")
 *
 * Guarantees (all idempotent):
 *   1. Appointment status → completed.
 *   2. patients.total_visits incremented EXACTLY once.
 *   3. patients.last_visit updated once.
 *   4. The appointment's active queue entry (waiting/in_progress) → completed.
 *   5. Linked pending follow-ups auto-completed once.
 *   6. A single appointment_history row written.
 *
 * Idempotency: the status transition is performed with a conditional UPDATE
 * (`status <> 'completed'`). Postgres row-locking serialises concurrent calls,
 * so only the FIRST transition affects a row. All the once-only side effects
 * (visit count, history) run only when that conditional UPDATE actually
 * changed a row. A second/duplicate completion is a no-op.
 */

import { completeLinkedFollowUps } from "@/lib/follow-ups/complete-linked";
import { writeAppointmentHistory } from "@/lib/appointments/history";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export type CompleteAppointmentResult = {
  /** True only when THIS call performed the completion (side effects ran). */
  completed: boolean;
  /** True when the appointment was already completed (idempotent no-op). */
  alreadyCompleted: boolean;
  /** True when the appointment does not exist / wrong clinic / deleted. */
  notFound: boolean;
  /** The patient id of the completed appointment, when resolvable. */
  patientId: string | null;
};

export async function completeAppointmentCascade(
  db: DbClient,
  params: {
    appointmentId: string;
    clinicId: string;
    performedBy: string | null;
  }
): Promise<CompleteAppointmentResult> {
  const { appointmentId, clinicId, performedBy } = params;
  const now = new Date().toISOString();

  // ── Resolve current state (for old-value history + early exits) ──────────
  const { data: existing } = await db
    .from("appointments")
    .select("id, patient_id, status")
    .eq("id", appointmentId)
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existing) {
    return { completed: false, alreadyCompleted: false, notFound: true, patientId: null };
  }

  const current = existing as { id: string; patient_id: string; status: string };

  if (current.status === "completed") {
    // Already completed — nothing to do (idempotent).
    return {
      completed: false,
      alreadyCompleted: true,
      notFound: false,
      patientId: current.patient_id,
    };
  }

  // ── Conditional transition → completed ───────────────────────────────────
  // `.neq("status", "completed")` makes the increment path run exactly once
  // even under concurrent completion attempts.
  const { data: updatedRows, error: updateErr } = await db
    .from("appointments")
    .update({ status: "completed", updated_at: now })
    .eq("id", appointmentId)
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .neq("status", "completed")
    .select("id, patient_id");

  if (updateErr) {
    console.error("[completeAppointmentCascade] update:", updateErr);
    return { completed: false, alreadyCompleted: false, notFound: false, patientId: current.patient_id };
  }

  const rows = (updatedRows ?? []) as { id: string; patient_id: string }[];

  if (rows.length === 0) {
    // Lost the race — another call completed it first. Treat as idempotent.
    return {
      completed: false,
      alreadyCompleted: true,
      notFound: false,
      patientId: current.patient_id,
    };
  }

  const patientId = rows[0].patient_id;

  // ── 1) Visit count + last visit (exactly once) ───────────────────────────
  const { data: patientData } = await db
    .from("patients")
    .select("total_visits")
    .eq("id", patientId)
    .single();

  const currentVisits =
    (patientData as { total_visits: number } | null)?.total_visits ?? 0;

  await db
    .from("patients")
    .update({
      total_visits: currentVisits + 1,
      last_visit: now,
      updated_at: now,
    })
    .eq("id", patientId);

  // ── 2) Mark the appointment's active queue entry completed ───────────────
  // Keeps the live queue consistent regardless of which path triggered
  // completion (the dentist status control no longer leaves stale entries).
  await db
    .from("queue_entries")
    .update({ status: "completed" })
    .eq("appointment_id", appointmentId)
    .eq("clinic_id", clinicId)
    .in("status", ["waiting", "in_progress"]);

  // ── 3) Auto-complete linked pending follow-ups (idempotent) ──────────────
  await completeLinkedFollowUps(db, appointmentId, clinicId);

  // ── 4) Audit history (exactly once) ──────────────────────────────────────
  await writeAppointmentHistory({
    appointmentId,
    action: "status_changed",
    oldValue: { status: current.status },
    newValue: { status: "completed" },
    performedBy,
  });

  return { completed: true, alreadyCompleted: false, notFound: false, patientId };
}
