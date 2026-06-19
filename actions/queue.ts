"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import type { ActionResult, QueueEntry, QueueEntryWithPatient } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

type ResolvedProfile = {
  id: string;
  clinic_id: string;
  role: "dentist" | "receptionist" | "patient";
};

// =============================================================================
// resolveSession — shared session + profile resolution
// =============================================================================

async function resolveSession(): Promise<{
  db: DbClient;
  profile: ResolvedProfile | null;
}> {
  const supabase = await createServerClient();
  const db: DbClient = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { db, profile: null };

  const { data } = await db
    .from("profiles")
    .select("id, clinic_id, role")
    .eq("id", user.id)
    .single();

  return { db, profile: (data as ResolvedProfile | null) ?? null };
}

const today = () => new Date().toISOString().split("T")[0];

// =============================================================================
// checkInPatient — creates queue_entries row
// Called by: receptionist CheckInButton
// =============================================================================

export async function checkInPatient(
  appointmentId: string
): Promise<ActionResult<QueueEntry>> {
  try {
    if (!appointmentId) return { data: null, error: "Appointment ID required" };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }

    // Verify appointment belongs to this clinic and is in a check-in-eligible state
    const { data: appt } = await db
      .from("appointments")
      .select("id, patient_id, status, clinic_id")
      .eq("id", appointmentId)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single();

    if (!appt) return { data: null, error: "Appointment not found." };

    const appointment = appt as {
      id: string;
      patient_id: string;
      status: string;
      clinic_id: string;
    };

    if (
      !["scheduled", "checked_in"].includes(appointment.status)
    ) {
      return {
        data: null,
        error: `Cannot check in a ${appointment.status} appointment.`,
      };
    }

    // Prevent duplicate check-ins (UNIQUE constraint on appointment_id)
    const { data: existing } = await db
      .from("queue_entries")
      .select("id")
      .eq("appointment_id", appointmentId)
      .maybeSingle();

    if (existing) {
      return { data: null, error: "Patient is already in the queue." };
    }

    // Get next position: MAX(position) + 1 for today's queue at this clinic
    const { data: posData } = await db
      .from("queue_entries")
      .select("position")
      .eq("clinic_id", profile.clinic_id)
      .eq("queue_date", today())
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextPosition = ((posData as { position: number } | null)?.position ?? 0) + 1;

    // Insert queue entry
    const { data: entry, error: insertErr } = await db
      .from("queue_entries")
      .insert({
        clinic_id: profile.clinic_id,
        appointment_id: appointmentId,
        patient_id: appointment.patient_id,
        position: nextPosition,
        status: "waiting",
        checked_in_at: new Date().toISOString(),
        queue_date: today(),
      })
      .select()
      .single();

    if (insertErr || !entry) {
      console.error("[checkInPatient] insert:", insertErr);
      return { data: null, error: "Failed to check in patient." };
    }

    // Also update the appointment status to checked_in if it was scheduled
    if (appointment.status === "scheduled") {
      await db
        .from("appointments")
        .update({ status: "checked_in", updated_at: new Date().toISOString() })
        .eq("id", appointmentId)
        .eq("clinic_id", profile.clinic_id);
    }

    revalidatePath(`/${profile.role}/queue`);
    revalidatePath(`/${profile.role}/appointments`);
    revalidatePath(`/${profile.role}/appointments/${appointmentId}`);

    return { data: entry as QueueEntry, error: null };
  } catch (err) {
    console.error("[checkInPatient] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// advanceQueue — in_progress → completed, promote first waiting → in_progress
// Called by: dentist + receptionist QueueEntry "Call Next" button
// =============================================================================

export async function advanceQueue(): Promise<ActionResult<null>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }

    const cid = profile.clinic_id;
    const qDate = today();

    // Find current in_progress entry
    const { data: currentData } = await db
      .from("queue_entries")
      .select("id, appointment_id")
      .eq("clinic_id", cid)
      .eq("queue_date", qDate)
      .eq("status", "in_progress")
      .maybeSingle();

    if (currentData) {
      const current = currentData as { id: string; appointment_id: string };

      // Complete the current in_progress entry
      await db
        .from("queue_entries")
        .update({ status: "completed" })
        .eq("id", current.id);

      // Also update appointment status to completed
      await db
        .from("appointments")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", current.appointment_id)
        .eq("clinic_id", cid);

      // Fetch patient for total_visits update
      const { data: apptData } = await db
        .from("appointments")
        .select("patient_id")
        .eq("id", current.appointment_id)
        .single();

      if (apptData) {
        const { patient_id } = apptData as { patient_id: string };
        const { data: patientData } = await db
          .from("patients")
          .select("total_visits")
          .eq("id", patient_id)
          .single();

        const currentVisits =
          (patientData as { total_visits: number } | null)?.total_visits ?? 0;

        await db
          .from("patients")
          .update({
            total_visits: currentVisits + 1,
            last_visit: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", patient_id);
      }
    }

    // Find the first waiting entry (lowest position) and promote to in_progress
    const { data: nextData } = await db
      .from("queue_entries")
      .select("id, appointment_id")
      .eq("clinic_id", cid)
      .eq("queue_date", qDate)
      .eq("status", "waiting")
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextData) {
      const next = nextData as { id: string; appointment_id: string };

      await db
        .from("queue_entries")
        .update({ status: "in_progress", called_at: new Date().toISOString() })
        .eq("id", next.id);

      // Update appointment status to in_progress
      await db
        .from("appointments")
        .update({ status: "in_progress", updated_at: new Date().toISOString() })
        .eq("id", next.appointment_id)
        .eq("clinic_id", cid);
    }

    revalidatePath(`/${profile.role}/queue`);

    return { data: null, error: null };
  } catch (err) {
    console.error("[advanceQueue] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// skipPatient — moves entry to end of queue, recalculates positions
// =============================================================================

export async function skipPatient(
  queueEntryId: string
): Promise<ActionResult<null>> {
  try {
    if (!queueEntryId) return { data: null, error: "Queue entry ID required" };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }

    const cid = profile.clinic_id;
    const qDate = today();

    // Verify the entry exists and belongs to this clinic
    const { data: entryData } = await db
      .from("queue_entries")
      .select("id, position, status")
      .eq("id", queueEntryId)
      .eq("clinic_id", cid)
      .eq("queue_date", qDate)
      .single();

    if (!entryData) return { data: null, error: "Queue entry not found." };

    const entry = entryData as { id: string; position: number; status: string };

    if (entry.status !== "waiting") {
      return {
        data: null,
        error: "Can only skip waiting patients.",
      };
    }

    // Get current max position
    const { data: maxData } = await db
      .from("queue_entries")
      .select("position")
      .eq("clinic_id", cid)
      .eq("queue_date", qDate)
      .eq("status", "waiting")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const maxPosition = (maxData as { position: number } | null)?.position ?? entry.position;

    if (entry.position === maxPosition) {
      // Already at the end — nothing to do
      return { data: null, error: null };
    }

    // Move all waiting entries with position > skipped.position up by 1
    // then put skipped entry at maxPosition
    const { data: toShift } = await db
      .from("queue_entries")
      .select("id, position")
      .eq("clinic_id", cid)
      .eq("queue_date", qDate)
      .eq("status", "waiting")
      .gt("position", entry.position)
      .order("position", { ascending: true });

    for (const row of (toShift ?? []) as { id: string; position: number }[]) {
      await db
        .from("queue_entries")
        .update({ position: row.position - 1 })
        .eq("id", row.id);
    }

    // Place the skipped entry at the end
    await db
      .from("queue_entries")
      .update({ position: maxPosition })
      .eq("id", queueEntryId);

    revalidatePath(`/${profile.role}/queue`);

    return { data: null, error: null };
  } catch (err) {
    console.error("[skipPatient] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getTodayQueue — full queue for today, scoped to clinic
// Joins patient name + appointment duration for wait-time calculation
// =============================================================================

export async function getTodayQueue(): Promise<
  ActionResult<QueueEntryWithPatient[]>
> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role === "patient") {
      return { data: null, error: "Forbidden" };
    }

    const { data, error } = await db
      .from("queue_entries")
      .select(
        "*, patient:patients(id, name), appointment:appointments(duration_minutes)"
      )
      .eq("clinic_id", profile.clinic_id)
      .eq("queue_date", today())
      .order("position", { ascending: true });

    if (error) {
      console.error("[getTodayQueue]", error);
      return { data: null, error: "Failed to fetch queue." };
    }

    // Flatten the nested appointment.duration_minutes into the entry
    const entries = (data ?? []).map(
      (row: {
        appointment: { duration_minutes: number } | null;
        [key: string]: unknown;
      }) => ({
        ...row,
        duration_minutes: row.appointment?.duration_minutes ?? 30,
      })
    );

    return { data: entries as QueueEntryWithPatient[], error: null };
  } catch (err) {
    console.error("[getTodayQueue] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getQueueStatus — patient portal: position, patients ahead, estimated wait
// Uses appointment-specific durations for accurate wait time calculation
// =============================================================================

export async function getQueueStatus(patientId: string): Promise<
  ActionResult<{
    position: number | null;
    patientsAhead: number;
    estimatedWaitMinutes: number;
    currentQueueNumber: number | null;
    myStatus: string | null;
  }>
> {
  try {
    if (!patientId) {
      return {
        data: { position: null, patientsAhead: 0, estimatedWaitMinutes: 0, currentQueueNumber: null, myStatus: null },
        error: null,
      };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    const qDate = today();

    // Find this patient's queue entry for today
    const { data: myEntryData } = await db
      .from("queue_entries")
      .select("id, position, status")
      .eq("patient_id", patientId)
      .eq("queue_date", qDate)
      .maybeSingle();

    if (!myEntryData) {
      return {
        data: {
          position: null,
          patientsAhead: 0,
          estimatedWaitMinutes: 0,
          currentQueueNumber: null,
          myStatus: null,
        },
        error: null,
      };
    }

    const myEntry = myEntryData as { id: string; position: number; status: string };

    // Get all waiting entries ahead of this patient WITH appointment durations
    const { data: aheadData } = await db
      .from("queue_entries")
      .select(
        "id, position, appointment:appointments(duration_minutes)"
      )
      .eq("patient_id", patientId) // RLS: patient only sees their own, so this is effectively ignored
      // Actually for the broader query we need staff-level access or a different approach.
      // Since this is called from both portal (patient RLS) and potentially staff context,
      // we scope by queue_date and status:
      .eq("queue_date", qDate)
      .eq("status", "waiting")
      .lt("position", myEntry.position)
      .order("position", { ascending: true });

    // For portal users (patient role), RLS on queue_entries only lets them see their own row.
    // We compute estimated wait from clinic_settings.average_appointment_duration as fallback.
    // For staff querying on behalf of patient, use appointment durations.
    let estimatedWaitMinutes = 0;
    let patientsAhead = 0;

    if (profile.role !== "patient") {
      // Staff context — can see all entries
      const aheadEntries = (aheadData ?? []) as {
        position: number;
        appointment: { duration_minutes: number } | null;
      }[];
      patientsAhead = aheadEntries.length;
      estimatedWaitMinutes = aheadEntries.reduce(
        (sum, e) => sum + (e.appointment?.duration_minutes ?? 30),
        0
      );
    } else {
      // Patient context — RLS limits visibility; use clinic average as fallback
      // Fetch clinic_settings.average_appointment_duration
      const { data: settingsData } = await db
        .from("clinic_settings")
        .select("average_appointment_duration")
        .maybeSingle();

      // For patients: fetch the count of waiting entries with lower position
      // (we can at least get a count from RLS-limited data)
      const avgDuration =
        (settingsData as { average_appointment_duration?: number } | null)
          ?.average_appointment_duration ?? 30;

      // Count entries ahead (limited by RLS, so we approximate)
      const { count } = await db
        .from("queue_entries")
        .select("id", { count: "exact", head: true })
        .eq("queue_date", qDate)
        .eq("status", "waiting")
        .lt("position", myEntry.position);

      patientsAhead = count ?? 0;
      estimatedWaitMinutes = patientsAhead * avgDuration;
    }

    // Find current in_progress entry number
    const { data: currentData } = await db
      .from("queue_entries")
      .select("position")
      .eq("queue_date", qDate)
      .eq("status", "in_progress")
      .maybeSingle();

    const currentQueueNumber =
      (currentData as { position: number } | null)?.position ?? null;

    return {
      data: {
        position: myEntry.position,
        patientsAhead,
        estimatedWaitMinutes,
        currentQueueNumber,
        myStatus: myEntry.status,
      },
      error: null,
    };
  } catch (err) {
    console.error("[getQueueStatus] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getQueueMetrics — today's stats for dashboard header
// =============================================================================

export async function getQueueMetrics(): Promise<
  ActionResult<{
    totalToday: number;
    checkedInToday: number;
    waitingNow: number;
    completedToday: number;
    inProgressNow: number;
    avgWaitMinutes: number;
  }>
> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role === "patient") {
      return { data: null, error: "Forbidden" };
    }

    const qDate = today();
    const cid = profile.clinic_id;

    const { data: entries } = await db
      .from("queue_entries")
      .select("status, checked_in_at, called_at, appointment:appointments(duration_minutes)")
      .eq("clinic_id", cid)
      .eq("queue_date", qDate);

    const rows = (entries ?? []) as {
      status: string;
      checked_in_at: string;
      called_at: string | null;
      appointment: { duration_minutes: number } | null;
    }[];

    const waiting = rows.filter((r) => r.status === "waiting");
    const inProgress = rows.filter((r) => r.status === "in_progress");
    const completed = rows.filter((r) => r.status === "completed");

    // Average wait = average of (called_at - checked_in_at) for completed/in_progress
    const withWaitTimes = [...completed, ...inProgress].filter(
      (r) => r.called_at
    );
    const avgWaitMinutes =
      withWaitTimes.length > 0
        ? Math.round(
            withWaitTimes.reduce((sum, r) => {
              const wait =
                (new Date(r.called_at!).getTime() -
                  new Date(r.checked_in_at).getTime()) /
                60000;
              return sum + wait;
            }, 0) / withWaitTimes.length
          )
        : 0;

    return {
      data: {
        totalToday: rows.length,
        checkedInToday: rows.length, // all queue entries represent checked-in patients
        waitingNow: waiting.length,
        completedToday: completed.length,
        inProgressNow: inProgress.length,
        avgWaitMinutes,
      },
      error: null,
    };
  } catch (err) {
    console.error("[getQueueMetrics] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
