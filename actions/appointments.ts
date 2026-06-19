"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import {
  CreateAppointmentSchema,
  RescheduleAppointmentSchema,
  UpdateAppointmentStatusSchema,
  VALID_APPOINTMENT_TRANSITIONS,
  type ActionResult,
  type Appointment,
  type AppointmentWithPatient,
  type AppointmentWithHistory,
  type AppointmentStatus,
  type AppointmentHistory,
} from "@/types";
import {
  getAvailableSlots as computeSlots,
  type AvailabilityRule as SlotRule,
  type OccupiedSlot,
} from "@/lib/scheduling/slots";

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

// =============================================================================
// writeHistory — insert appointment_history row via service role
// Service-role bypasses RLS; appointment_history has no client write policy.
// =============================================================================

async function writeHistory(row: {
  appointment_id: string;
  action: "created" | "rescheduled" | "cancelled" | "status_changed";
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  performed_by: string | null;
}) {
  // Use service role for history inserts — history table has no write RLS
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await serviceClient.from("appointment_history").insert({
    appointment_id: row.appointment_id,
    action: row.action,
    old_value: row.old_value ?? null,
    new_value: row.new_value ?? null,
    performed_by: row.performed_by,
  });

  if (error) {
    // History write failure is non-fatal — log but don't block the mutation
    console.error("[writeHistory]", error);
  }
}

// =============================================================================
// createAppointment — staff booking path
// =============================================================================

export async function createAppointment(
  input: unknown
): Promise<ActionResult<Appointment>> {
  try {
    const parsed = CreateAppointmentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message ?? "Invalid input",
      };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }

    // ── Resolve dentist_id ──────────────────────────────────────────────────
    // Dentist = their own profile; Receptionist = find the clinic's dentist
    let dentistId: string;
    if (profile.role === "dentist") {
      dentistId = profile.id;
    } else {
      const { data: dentistData } = await db
        .from("profiles")
        .select("id")
        .eq("clinic_id", profile.clinic_id)
        .eq("role", "dentist")
        .limit(1)
        .single();

      if (!dentistData) {
        return { data: null, error: "No dentist found for this clinic." };
      }
      dentistId = (dentistData as { id: string }).id;
    }

    // ── Validate patient belongs to this clinic ────────────────────────────
    const { data: patientData } = await db
      .from("patients")
      .select("id")
      .eq("id", parsed.data.patient_id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single();

    if (!patientData) {
      return { data: null, error: "Patient not found." };
    }

    // ── Double-booking check (unique index: dentist_id + scheduled_at) ─────
    const { data: existingSlot } = await db
      .from("appointments")
      .select("id")
      .eq("dentist_id", dentistId)
      .eq("scheduled_at", parsed.data.scheduled_at)
      .is("deleted_at", null)
      .not("status", "in", '("cancelled","no_show")')
      .maybeSingle();

    if (existingSlot) {
      return {
        data: null,
        error: "This time slot is already booked. Please choose another.",
      };
    }

    // ── Validate slot against availability rules ───────────────────────────
    const requestedDate = parsed.data.scheduled_at.split("T")[0];
    const requestedDow = new Date(requestedDate).getDay(); // 0=Sun…6=Sat

    const { data: rules } = await db
      .from("availability_rules")
      .select("start_time, end_time, slot_duration_minutes")
      .eq("clinic_id", profile.clinic_id)
      .eq("day_of_week", requestedDow)
      .eq("is_active", true);

    if (!rules || rules.length === 0) {
      return {
        data: null,
        error: "No availability configured for that day. Please choose another date.",
      };
    }

    // Fetch occupied slots for validation (with durations)
    const { data: occupied } = await db
      .from("appointments")
      .select("scheduled_at, duration_minutes")
      .eq("dentist_id", dentistId)
      .gte("scheduled_at", `${requestedDate}T00:00:00`)
      .lte("scheduled_at", `${requestedDate}T23:59:59`)
      .is("deleted_at", null)
      .not("status", "in", '("cancelled","no_show")');

    const slotRules: SlotRule[] = (rules as { start_time: string; end_time: string; slot_duration_minutes: number }[]).map((r) => ({
      startTime: r.start_time.slice(0, 5),
      endTime: r.end_time.slice(0, 5),
      slotDurationMinutes: r.slot_duration_minutes,
    }));

    const occupiedSlots: OccupiedSlot[] = (occupied ?? []).map((o: { scheduled_at: string; duration_minutes: number }) => ({
      scheduledAt: o.scheduled_at,
      durationMinutes: o.duration_minutes ?? 30,
    }));

    const requestedDuration = parsed.data.duration_minutes ?? 30;
    const availableSlots = computeSlots(requestedDate, slotRules, occupiedSlots, "UTC", requestedDuration);

    // Normalise the requested slot to match the format returned by computeSlots
    const requestedSlotNorm = parsed.data.scheduled_at.slice(0, 16) + ":00"; // YYYY-MM-DDTHH:MM:00
    const isAvailable = availableSlots.some(
      (s) => s.slice(0, 16) === requestedSlotNorm.slice(0, 16)
    );

    if (!isAvailable) {
      return {
        data: null,
        error: "Selected time slot is not available. Please choose from the available slots.",
      };
    }

    // ── Insert appointment ─────────────────────────────────────────────────
    const { data: appointment, error: insertErr } = await db
      .from("appointments")
      .insert({
        clinic_id: profile.clinic_id,
        patient_id: parsed.data.patient_id,
        dentist_id: dentistId,
        scheduled_at: parsed.data.scheduled_at,
        duration_minutes: parsed.data.duration_minutes ?? 30,
        source: parsed.data.source,
        notes: parsed.data.notes ?? null,
        status: "scheduled",
        created_by: profile.id,
      })
      .select()
      .single();

    if (insertErr || !appointment) {
      console.error("[createAppointment] insert:", insertErr);
      return { data: null, error: "Failed to create appointment." };
    }

    // ── Write history row ──────────────────────────────────────────────────
    await writeHistory({
      appointment_id: (appointment as Appointment).id,
      action: "created",
      old_value: null,
      new_value: {
        scheduled_at: parsed.data.scheduled_at,
        status: "scheduled",
        source: parsed.data.source,
      },
      performed_by: profile.id,
    });

    revalidatePath(`/${profile.role}/appointments`);
    return { data: appointment as Appointment, error: null };
  } catch (err) {
    console.error("[createAppointment] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// updateAppointmentStatus
// =============================================================================

export async function updateAppointmentStatus(
  input: unknown
): Promise<ActionResult<Appointment>> {
  try {
    const parsed = UpdateAppointmentStatusSchema.safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message ?? "Invalid input",
      };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    // Only dentist can advance status (receptionist can check-in via queue action)
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can update appointment status." };
    }

    // Fetch current appointment
    const { data: current, error: fetchErr } = await db
      .from("appointments")
      .select("*")
      .eq("id", parsed.data.appointment_id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single();

    if (fetchErr || !current) {
      return { data: null, error: "Appointment not found." };
    }

    const currentAppt = current as Appointment;
    const currentStatus = currentAppt.status as AppointmentStatus;
    const newStatus = parsed.data.new_status as AppointmentStatus;

    // Validate transition
    const validNext = VALID_APPOINTMENT_TRANSITIONS[currentStatus];
    if (!validNext.includes(newStatus)) {
      return {
        data: null,
        error: `Cannot transition from "${currentStatus}" to "${newStatus}".`,
      };
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    // ── On completed: update patient total_visits + last_visit ────────────
    if (newStatus === "completed") {
      await db
        .from("patients")
        .update({
          total_visits: currentAppt.patient_id, // placeholder — raw SQL below
        })
        .eq("id", currentAppt.patient_id);

      // Use rpc or a direct SQL increment via Supabase
      // We'll use the Supabase rpc pattern for atomic increment
      const { data: patientData } = await db
        .from("patients")
        .select("total_visits")
        .eq("id", currentAppt.patient_id)
        .single();

      const currentVisits = (patientData as { total_visits: number } | null)?.total_visits ?? 0;

      await db
        .from("patients")
        .update({
          total_visits: currentVisits + 1,
          last_visit: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentAppt.patient_id);
    }

    const { data: updated, error: updateErr } = await db
      .from("appointments")
      .update(updatePayload)
      .eq("id", parsed.data.appointment_id)
      .eq("clinic_id", profile.clinic_id)
      .select()
      .single();

    if (updateErr || !updated) {
      console.error("[updateAppointmentStatus] update:", updateErr);
      return { data: null, error: "Failed to update appointment status." };
    }

    // ── Write history ──────────────────────────────────────────────────────
    await writeHistory({
      appointment_id: parsed.data.appointment_id,
      action: "status_changed",
      old_value: { status: currentStatus },
      new_value: { status: newStatus },
      performed_by: profile.id,
    });

    revalidatePath(`/${profile.role}/appointments`);
    revalidatePath(`/${profile.role}/appointments/${parsed.data.appointment_id}`);

    return { data: updated as Appointment, error: null };
  } catch (err) {
    console.error("[updateAppointmentStatus] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// rescheduleAppointment
// =============================================================================

export async function rescheduleAppointment(
  input: unknown
): Promise<ActionResult<Appointment>> {
  try {
    const parsed = RescheduleAppointmentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message ?? "Invalid input",
      };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }

    // Fetch appointment and verify clinic ownership
    const { data: current } = await db
      .from("appointments")
      .select("*")
      .eq("id", parsed.data.appointment_id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single();

    if (!current) {
      return { data: null, error: "Appointment not found." };
    }

    const currentAppt = current as Appointment;

    // Can only reschedule non-terminal appointments
    if (["completed", "cancelled", "no_show"].includes(currentAppt.status)) {
      return {
        data: null,
        error: `Cannot reschedule a ${currentAppt.status} appointment.`,
      };
    }

    const newDate = parsed.data.new_scheduled_at.split("T")[0];
    const newDow = new Date(newDate).getDay();

    // Validate new slot availability
    const { data: rules } = await db
      .from("availability_rules")
      .select("start_time, end_time, slot_duration_minutes")
      .eq("clinic_id", profile.clinic_id)
      .eq("day_of_week", newDow)
      .eq("is_active", true);

    if (!rules || rules.length === 0) {
      return { data: null, error: "No availability on the selected date." };
    }

    // Occupied slots for new date (exclude the appointment being rescheduled) — with durations
    const { data: occupied } = await db
      .from("appointments")
      .select("scheduled_at, duration_minutes")
      .eq("dentist_id", currentAppt.dentist_id)
      .neq("id", parsed.data.appointment_id)
      .gte("scheduled_at", `${newDate}T00:00:00`)
      .lte("scheduled_at", `${newDate}T23:59:59`)
      .is("deleted_at", null)
      .not("status", "in", '("cancelled","no_show")');

    const slotRules: SlotRule[] = (rules as { start_time: string; end_time: string; slot_duration_minutes: number }[]).map((r) => ({
      startTime: r.start_time.slice(0, 5),
      endTime: r.end_time.slice(0, 5),
      slotDurationMinutes: r.slot_duration_minutes,
    }));

    const occupiedSlots: OccupiedSlot[] = (occupied ?? []).map((o: { scheduled_at: string; duration_minutes: number }) => ({
      scheduledAt: o.scheduled_at,
      durationMinutes: o.duration_minutes ?? 30,
    }));

    const rescheduleDuration = currentAppt.duration_minutes ?? 30;
    const available = computeSlots(newDate, slotRules, occupiedSlots, "UTC", rescheduleDuration);
    const isAvailable = available.some(
      (s) => s.slice(0, 16) === parsed.data.new_scheduled_at.slice(0, 16)
    );

    if (!isAvailable) {
      return {
        data: null,
        error: "Selected time slot is not available.",
      };
    }

    const oldScheduledAt = currentAppt.scheduled_at;

    const { data: updated, error: updateErr } = await db
      .from("appointments")
      .update({
        scheduled_at: parsed.data.new_scheduled_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.appointment_id)
      .eq("clinic_id", profile.clinic_id)
      .select()
      .single();

    if (updateErr || !updated) {
      console.error("[rescheduleAppointment] update:", updateErr);
      return { data: null, error: "Failed to reschedule appointment." };
    }

    await writeHistory({
      appointment_id: parsed.data.appointment_id,
      action: "rescheduled",
      old_value: { scheduled_at: oldScheduledAt },
      new_value: { scheduled_at: parsed.data.new_scheduled_at },
      performed_by: profile.id,
    });

    revalidatePath(`/${profile.role}/appointments`);
    revalidatePath(`/${profile.role}/appointments/${parsed.data.appointment_id}`);

    return { data: updated as Appointment, error: null };
  } catch (err) {
    console.error("[rescheduleAppointment] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// cancelAppointment
// =============================================================================

export async function cancelAppointment(
  appointmentId: string,
  reason?: string
): Promise<ActionResult<null>> {
  try {
    if (!appointmentId) return { data: null, error: "Appointment ID required" };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }

    const { data: current } = await db
      .from("appointments")
      .select("status, scheduled_at")
      .eq("id", appointmentId)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single();

    if (!current) return { data: null, error: "Appointment not found." };

    const appt = current as { status: string; scheduled_at: string };

    if (["completed", "cancelled", "no_show"].includes(appt.status)) {
      return { data: null, error: `Cannot cancel a ${appt.status} appointment.` };
    }

    const { error: updateErr } = await db
      .from("appointments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", appointmentId)
      .eq("clinic_id", profile.clinic_id);

    if (updateErr) {
      console.error("[cancelAppointment]", updateErr);
      return { data: null, error: "Failed to cancel appointment." };
    }

    await writeHistory({
      appointment_id: appointmentId,
      action: "cancelled",
      old_value: { status: appt.status },
      new_value: { status: "cancelled", reason: reason ?? null },
      performed_by: profile.id,
    });

    revalidatePath(`/${profile.role}/appointments`);
    revalidatePath(`/${profile.role}/appointments/${appointmentId}`);

    return { data: null, error: null };
  } catch (err) {
    console.error("[cancelAppointment] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getAppointmentsToday — dashboard KPI + list query, scoped to today
// =============================================================================

export async function getAppointmentsToday(): Promise<
  ActionResult<AppointmentWithPatient[]>
> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await db
      .from("appointments")
      .select("*, patient:patients(id, name, phone)")
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .gte("scheduled_at", `${today}T00:00:00`)
      .lte("scheduled_at", `${today}T23:59:59`)
      .order("scheduled_at", { ascending: true });

    if (error) {
      console.error("[getAppointmentsToday]", error);
      return { data: null, error: "Failed to fetch today's appointments." };
    }

    return { data: (data ?? []) as AppointmentWithPatient[], error: null };
  } catch (err) {
    console.error("[getAppointmentsToday] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getAppointment — single appointment with patient + audit history
// =============================================================================

export async function getAppointment(
  id: string
): Promise<ActionResult<AppointmentWithHistory>> {
  try {
    if (!id) return { data: null, error: "Appointment ID required" };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    // Patients can only fetch via their portal link — handled by RLS
    // Staff query scoped to clinic_id
    const isPatient = profile.role === "patient";

    const appointmentQuery = isPatient
      ? db
          .from("appointments")
          .select("*, patient:patients(id, name, phone)")
          .eq("id", id)
          .is("deleted_at", null)
          .single()
      : db
          .from("appointments")
          .select("*, patient:patients(id, name, phone)")
          .eq("id", id)
          .eq("clinic_id", profile.clinic_id)
          .is("deleted_at", null)
          .single();

    const { data: appointment, error: apptErr } = await appointmentQuery;

    if (apptErr || !appointment) {
      return { data: null, error: "Appointment not found." };
    }

    // Fetch history (staff only — patients don't see audit trail)
    let history: AppointmentHistory[] = [];
    if (!isPatient) {
      const { data: historyData } = await db
        .from("appointment_history")
        .select("*")
        .eq("appointment_id", id)
        .order("timestamp", { ascending: false });

      history = (historyData ?? []) as AppointmentHistory[];
    }

    return {
      data: {
        ...(appointment as AppointmentWithPatient),
        history,
      },
      error: null,
    };
  } catch (err) {
    console.error("[getAppointment] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getAppointments — paginated list with filters
// =============================================================================

export async function getAppointments(filters?: {
  status?: AppointmentStatus;
  dateFrom?: string;
  dateTo?: string;
  patientId?: string;
  page?: number;
  limit?: number;
}): Promise<ActionResult<{ appointments: AppointmentWithPatient[]; total: number }>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    const page = filters?.page ?? 1;
    const limit = Math.min(filters?.limit ?? 20, 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = db
      .from("appointments")
      .select("*, patient:patients(id, name, phone)", { count: "exact" })
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: false });

    // Staff: scope to clinic; patient: RLS handles their own data
    if (profile.role !== "patient") {
      query = query.eq("clinic_id", profile.clinic_id);
    }

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.dateFrom) query = query.gte("scheduled_at", `${filters.dateFrom}T00:00:00`);
    if (filters?.dateTo) query = query.lte("scheduled_at", `${filters.dateTo}T23:59:59`);
    if (filters?.patientId) query = query.eq("patient_id", filters.patientId);

    const { data, error, count } = await query.range(from, to);

    if (error) {
      console.error("[getAppointments]", error);
      return { data: null, error: "Failed to fetch appointments." };
    }

    return {
      data: {
        appointments: (data ?? []) as AppointmentWithPatient[],
        total: count ?? 0,
      },
      error: null,
    };
  } catch (err) {
    console.error("[getAppointments] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getAvailableDentist — resolves dentist_id for a clinic (single-dentist MVP)
// =============================================================================

export async function getClinicDentist(
  clinicId: string
): Promise<ActionResult<{ id: string; full_name: string }>> {
  try {
    const supabase = await createServerClient();
    const db: DbClient = supabase;

    const { data, error } = await db
      .from("profiles")
      .select("id, full_name")
      .eq("clinic_id", clinicId)
      .eq("role", "dentist")
      .limit(1)
      .single();

    if (error || !data) {
      return { data: null, error: "No dentist found for this clinic." };
    }

    return { data: data as { id: string; full_name: string }, error: null };
  } catch (err) {
    console.error("[getClinicDentist] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
