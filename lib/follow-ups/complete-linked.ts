/**
 * lib/follow-ups/complete-linked.ts
 *
 * Shared helper that automatically completes follow-ups linked to an
 * appointment when that appointment transitions to `completed`.
 *
 * Used by EVERY appointment-completion path so the behaviour is consistent:
 *   - actions/appointments.ts → updateAppointmentStatus (dentist controls)
 *   - actions/queue.ts        → advanceQueue (queue advancement)
 *
 * Design notes:
 *   - Only `pending` follow-ups are touched. Already `completed`/`cancelled`
 *     follow-ups are left untouched, which prevents duplicate completion and
 *     preserves their existing audit timestamps.
 *   - Clinic isolation is enforced via the clinic_id filter.
 *   - Soft-deleted follow-ups are excluded.
 *   - Failure is non-fatal: the appointment completion must never be blocked
 *     by a follow-up update error. We log and move on.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

/**
 * Marks every pending follow-up linked to `appointmentId` (within `clinicId`)
 * as completed. Returns the number of follow-ups updated.
 */
export async function completeLinkedFollowUps(
  db: DbClient,
  appointmentId: string | null | undefined,
  clinicId: string | null | undefined
): Promise<number> {
  if (!appointmentId || !clinicId) return 0;

  try {
    const { data, error } = await db
      .from("follow_ups")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("appointment_id", appointmentId)
      .eq("clinic_id", clinicId)
      .eq("status", "pending") // idempotent — never re-completes
      .is("deleted_at", null)
      .select("id");

    if (error) {
      console.error("[completeLinkedFollowUps]", error);
      return 0;
    }

    return Array.isArray(data) ? data.length : 0;
  } catch (err) {
    console.error("[completeLinkedFollowUps] unexpected:", err);
    return 0;
  }
}
