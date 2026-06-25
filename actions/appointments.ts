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
import { zonedDateToUTC, getTodayInTimezone, getUtcBoundariesForLocalDate } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/admin";

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

    // ── Role-based access: staff + portal patients can book ───────────────
    if (
      profile.role !== "dentist" &&
      profile.role !== "receptionist" &&
      profile.role !== "patient"
    ) {
      return { data: null, error: "Forbidden" };
    }

    // ── Patient portal path: verify the patient_id matches the portal link ─
    // Prevents a portal user from booking on behalf of another patient.
    let resolvedClinicId = profile.clinic_id;
    if (profile.role === "patient") {
      const { data: linkData } = await db
        .from("patient_portal_links")
        .select("patient_id, patients!inner(clinic_id)")
        .eq("user_id", profile.id)
        .single();

      if (!linkData) {
        return { data: null, error: "Portal account not linked." };
      }

      const link = linkData as {
        patient_id: string;
        patients: { clinic_id: string } | { clinic_id: string }[] | null;
      };

      const linkedPatientId = link.patient_id;
      const linkedClinicId = Array.isArray(link.patients)
        ? link.patients[0]?.clinic_id
        : link.patients?.clinic_id;

      if (!linkedClinicId) {
        return { data: null, error: "Unable to determine clinic." };
      }

      // Portal user must book for themselves only
      if (parsed.data.patient_id !== linkedPatientId) {
        return { data: null, error: "Forbidden: you can only book for yourself." };
      }

      resolvedClinicId = linkedClinicId;
    }

    // ── Resolve dentist_id ──────────────────────────────────────────────────
    // Dentist = their own profile; Receptionist + Patient = find the clinic's dentist
    let dentistId: string;
    if (profile.role === "dentist") {
      dentistId = profile.id;
    } else {
      const { data: dentistData } = await db
        .from("profiles")
        .select("id")
        .eq("clinic_id", resolvedClinicId)
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
      .eq("clinic_id", resolvedClinicId)
      .is("deleted_at", null)
      .single();

    if (!patientData) {
      return { data: null, error: "Patient not found." };
    }

    // ── Validate slot against availability rules ───────────────────────────
    const requestedDate = parsed.data.scheduled_at.split("T")[0];

    // Fetch all needed clinic settings in a single query upfront.
    // Previously: fetched timezone first, then clinic_hours in a second call
    // if no availability rules existed — two separate round-trips.
    const { data: settingsData } = await db
      .from("clinic_settings")
      .select("timezone, clinic_hours, average_appointment_duration")
      .eq("clinic_id", resolvedClinicId)
      .maybeSingle();
    const clinicTimezone = (settingsData as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";

    // ── Convert local slot string to UTC now that we have the timezone ─────
    // Slots from getAvailableSlots() are "YYYY-MM-DDTHH:MM:00" — wall-clock
    // local time with no timezone offset. PostgreSQL's timestamptz column
    // interprets a bare datetime string as UTC, which would cause a +5:30
    // shift for Asia/Kolkata clinics. Convert here before any DB comparison.
    const scheduledAtUtc = zonedDateToUTC(parsed.data.scheduled_at, clinicTimezone).toISOString();

    // ── Double-booking check (unique index: dentist_id + scheduled_at) ─────
    // Compare against the UTC value that will actually be stored.
    const { data: existingSlot } = await db
      .from("appointments")
      .select("id")
      .eq("dentist_id", dentistId)
      .eq("scheduled_at", scheduledAtUtc)
      .is("deleted_at", null)
      .not("status", "in", '("cancelled","no_show")')
      .maybeSingle();

    if (existingSlot) {
      return {
        data: null,
        error: "This time slot is already booked. Please choose another.",
      };
    }
    // ── Past-date rejection (server-side guard) ────────────────────────────
    // Compute today in the clinic's local timezone to avoid UTC midnight shift.
    const todayInTz = new Intl.DateTimeFormat("en-CA", {
      timeZone: clinicTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    if (requestedDate < todayInTz) {
      return { data: null, error: "Cannot create an appointment in the past." };
    }

    // ── DOW: use timezone-aware calculation ───────────────────────────────
    // new Date("YYYY-MM-DD").getDay() is midnight UTC → wrong DOW for tz behind UTC.
    const noonLocal = new Date(`${requestedDate}T12:00:00`);
    const dowStr = new Intl.DateTimeFormat("en-US", {
      timeZone: clinicTimezone,
      weekday: "short",
    }).format(noonLocal);
    const dowMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const requestedDow = dowMap[dowStr] ?? noonLocal.getDay();

    // ── Build slot rules — mirror getAvailableSlots priority order ────────
    // Priority 1: explicit availability_rules (legacy / override path)
    // Priority 2: clinic_hours from clinic_settings (primary path going forward)
    // If neither exists → "No availability configured for that day."
    const { data: rules } = await db
      .from("availability_rules")
      .select("start_time, end_time, slot_duration_minutes")
      .eq("clinic_id", resolvedClinicId)
      .eq("day_of_week", requestedDow)
      .eq("is_active", true);

    let slotRules: SlotRule[];

    if (rules && rules.length > 0) {
      // Explicit availability rules exist — use them
      slotRules = (rules as { start_time: string; end_time: string; slot_duration_minutes: number }[]).map((r) => ({
        startTime: r.start_time.slice(0, 5),
        endTime: r.end_time.slice(0, 5),
        slotDurationMinutes: r.slot_duration_minutes,
      }));
    } else {
      // No explicit rules — fall back to clinic_hours (already fetched above).
      const clinicHours = (settingsData as { clinic_hours?: Record<string, { open: string | null; close: string | null; is_open: boolean }> } | null)?.clinic_hours ?? null;
      const defaultSlotDuration = (settingsData as { average_appointment_duration?: number } | null)?.average_appointment_duration ?? 30;

      if (!clinicHours) {
        return {
          data: null,
          error: "No availability configured for that day. Please choose another date.",
        };
      }

      // Map DOW integer → day name for clinic_hours lookup
      const DOW_TO_DAY_NAME: Record<number, string> = {
        0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday",
        4: "thursday", 5: "friday", 6: "saturday",
      };
      const dayName = DOW_TO_DAY_NAME[requestedDow];
      const dayHours = dayName ? clinicHours[dayName] : null;

      if (!dayHours || !dayHours.is_open || !dayHours.open || !dayHours.close) {
        return {
          data: null,
          error: "No availability configured for that day. Please choose another date.",
        };
      }

      slotRules = [{
        startTime: dayHours.open.slice(0, 5),
        endTime: dayHours.close.slice(0, 5),
        slotDurationMinutes: defaultSlotDuration,
      }];
    }

    // Fetch occupied slots for validation (with durations)
    // Use UTC boundaries for the clinic's local date so that the gte/lte
    // comparison against the timestamptz column is correct.
    const { start: occupiedStart, end: occupiedEnd } =
      getUtcBoundariesForLocalDate(requestedDate, clinicTimezone);
    const { data: occupied } = await db
      .from("appointments")
      .select("scheduled_at, duration_minutes")
      .eq("dentist_id", dentistId)
      .gte("scheduled_at", occupiedStart)
      .lte("scheduled_at", occupiedEnd)
      .is("deleted_at", null)
      .not("status", "in", '("cancelled","no_show")');

    const occupiedSlots: OccupiedSlot[] = (occupied ?? []).map((o: { scheduled_at: string; duration_minutes: number }) => ({
      scheduledAt: o.scheduled_at,
      durationMinutes: o.duration_minutes ?? 30,
    }));

    const requestedDuration = parsed.data.duration_minutes ?? 30;
    const availableSlots = computeSlots(requestedDate, slotRules, occupiedSlots, clinicTimezone, requestedDuration);

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

    // ── Convert local slot string to UTC before inserting ──────────────────
    // (Already computed above as scheduledAtUtc — see UTC conversion note.)

    // ── Insert appointment ─────────────────────────────────────────────────
    // For patient portal bookings: use the admin (service-role) client to
    // bypass RLS — the RLS policy drops the patient INSERT permission and
    // routes bookings through the create_patient_appointment() DB function.
    // Our server action performs identical validation, so we use admin insert
    // directly rather than the RPC function (both are safe server-side).
    const insertDb = profile.role === "patient" ? createAdminClient() : db;

    const { data: appointment, error: insertErr } = await insertDb
      .from("appointments")
      .insert({
        clinic_id: resolvedClinicId,
        patient_id: parsed.data.patient_id,
        dentist_id: dentistId,
        scheduled_at: scheduledAtUtc,
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
        scheduled_at: scheduledAtUtc,
        status: "scheduled",
        source: parsed.data.source,
      },
      performed_by: profile.id,
    });

    if (profile.role === "patient") {
      revalidatePath("/portal/appointments");
    } else {
      revalidatePath(`/${profile.role}/appointments`);
    }
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

    // Both staff roles can transition appointments. The role-allowed list
    // restricts what each can do:
    //   - dentist: full lifecycle including completing appointments.
    //   - receptionist: scheduled → checked_in / cancelled / no_show only.
    //                   Cannot mark in_progress or completed (those are
    //                   driven by queue advancement).
    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }

    const RECEPTIONIST_ALLOWED_TARGETS: AppointmentStatus[] = [
      "checked_in",
      "cancelled",
      "no_show",
    ];
    if (
      profile.role === "receptionist" &&
      !RECEPTIONIST_ALLOWED_TARGETS.includes(parsed.data.new_status as AppointmentStatus)
    ) {
      return {
        data: null,
        error: "Receptionists cannot set this status. Ask the dentist to advance the appointment.",
      };
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

    // ── On checked_in: create queue_entries row ────────────────────────────
    // The receptionist path uses checkInPatient() directly (which also calls
    // this transition). The dentist path uses AppointmentStatusControl →
    // updateAppointmentStatus, which previously skipped queue entry creation.
    // Both paths must produce a queue_entries row on checked_in.
    if (newStatus === "checked_in") {
      // Resolve clinic timezone for correct queue_date
      const { data: tzData } = await db
        .from("clinic_settings")
        .select("timezone")
        .eq("clinic_id", profile.clinic_id)
        .maybeSingle();
      const tz = (tzData as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";
      const qDate = getTodayInTimezone(tz);

      // Check for an existing queue entry for this appointment (any date).
      // The uq_queue_appointment constraint is not date-scoped — one appointment
      // can only appear once in queue_entries globally.
      const { data: existingEntry } = await db
        .from("queue_entries")
        .select("id, queue_date")
        .eq("appointment_id", parsed.data.appointment_id)
        .maybeSingle();

      if (!existingEntry) {
        // Get next position: MAX(position) for today's clinic queue + 1
        const { data: posData } = await db
          .from("queue_entries")
          .select("position")
          .eq("clinic_id", profile.clinic_id)
          .eq("queue_date", qDate)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();

        const nextPosition = ((posData as { position: number } | null)?.position ?? 0) + 1;

        console.log("[updateAppointmentStatus → checked_in] inserting queue entry:", {
          clinic_id: profile.clinic_id,
          appointment_id: parsed.data.appointment_id,
          patient_id: currentAppt.patient_id,
          position: nextPosition,
          queue_date: qDate,
        });

        const { error: queueInsertErr } = await db
          .from("queue_entries")
          .insert({
            clinic_id: profile.clinic_id,
            appointment_id: parsed.data.appointment_id,
            patient_id: currentAppt.patient_id,
            position: nextPosition,
            status: "waiting",
            checked_in_at: new Date().toISOString(),
            queue_date: qDate,
          });

        if (queueInsertErr) {
          console.error("[updateAppointmentStatus → checked_in] queue insert failed:", queueInsertErr);
          // Roll back the appointment status change — the check-in is not
          // complete without a queue entry.
          await db
            .from("appointments")
            .update({ status: currentStatus, updated_at: new Date().toISOString() })
            .eq("id", parsed.data.appointment_id)
            .eq("clinic_id", profile.clinic_id);
          return { data: null, error: `Check-in failed: ${queueInsertErr.message}` };
        }

        console.log("[updateAppointmentStatus → checked_in] queue entry created, position:", nextPosition);
        revalidatePath(`/${profile.role}/queue`);
      } else {
        // Entry already exists (e.g. receptionist checked in before dentist
        // attempted the same transition). Not an error — idempotent.
        console.log("[updateAppointmentStatus → checked_in] queue entry already exists for this appointment, skipping insert");
      }
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

    // Fetch all needed clinic settings in a single query — previously fetched
    // timezone first, then clinic_hours in a second call as a fallback.
    const { data: settingsData } = await db
      .from("clinic_settings")
      .select("timezone, clinic_hours, average_appointment_duration")
      .eq("clinic_id", profile.clinic_id)
      .maybeSingle();
    const clinicTimezone = (settingsData as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";

    // ── Convert local slot string to UTC ───────────────────────────────────
    // Slots from getAvailableSlots() are wall-clock local strings with no
    // offset. Convert to UTC before storing to prevent the +5:30 shift.
    const newScheduledAtUtc = zonedDateToUTC(parsed.data.new_scheduled_at, clinicTimezone).toISOString();

    // ── Past-date rejection (server-side guard) ────────────────────────────
    const todayInTz = new Intl.DateTimeFormat("en-CA", {
      timeZone: clinicTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    if (newDate < todayInTz) {
      return { data: null, error: "Cannot reschedule to a past date." };
    }

    // ── DOW: use timezone-aware calculation ───────────────────────────────
    const noonLocal = new Date(`${newDate}T12:00:00`);
    const dowStr = new Intl.DateTimeFormat("en-US", {
      timeZone: clinicTimezone,
      weekday: "short",
    }).format(noonLocal);
    const dowMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const newDow = dowMap[dowStr] ?? noonLocal.getDay();

    // ── Validate new slot availability — mirror getAvailableSlots priority order ──
    const { data: reschedRules } = await db
      .from("availability_rules")
      .select("start_time, end_time, slot_duration_minutes")
      .eq("clinic_id", profile.clinic_id)
      .eq("day_of_week", newDow)
      .eq("is_active", true);

    let slotRules: SlotRule[];

    if (reschedRules && reschedRules.length > 0) {
      slotRules = (reschedRules as { start_time: string; end_time: string; slot_duration_minutes: number }[]).map((r) => ({
        startTime: r.start_time.slice(0, 5),
        endTime: r.end_time.slice(0, 5),
        slotDurationMinutes: r.slot_duration_minutes,
      }));
    } else {
      // Fall back to clinic_hours — already fetched above in settingsData.
      const clinicHours = (settingsData as { clinic_hours?: Record<string, { open: string | null; close: string | null; is_open: boolean }> } | null)?.clinic_hours ?? null;
      const defaultSlotDuration = (settingsData as { average_appointment_duration?: number } | null)?.average_appointment_duration ?? 30;

      const DOW_TO_DAY_NAME: Record<number, string> = {
        0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday",
        4: "thursday", 5: "friday", 6: "saturday",
      };
      const dayName = DOW_TO_DAY_NAME[newDow];
      const dayHours = dayName && clinicHours ? clinicHours[dayName] : null;

      if (!dayHours || !dayHours.is_open || !dayHours.open || !dayHours.close) {
        return { data: null, error: "No availability on the selected date." };
      }

      slotRules = [{
        startTime: dayHours.open.slice(0, 5),
        endTime: dayHours.close.slice(0, 5),
        slotDurationMinutes: defaultSlotDuration,
      }];
    }

    // Occupied slots for new date (exclude the appointment being rescheduled) — with durations
    // Use UTC boundaries for the clinic's local date so the timestamptz comparison is correct.
    const { start: reschedStart, end: reschedEnd } =
      getUtcBoundariesForLocalDate(newDate, clinicTimezone);
    const { data: occupied } = await db
      .from("appointments")
      .select("scheduled_at, duration_minutes")
      .eq("dentist_id", currentAppt.dentist_id)
      .neq("id", parsed.data.appointment_id)
      .gte("scheduled_at", reschedStart)
      .lte("scheduled_at", reschedEnd)
      .is("deleted_at", null)
      .not("status", "in", '("cancelled","no_show")');

    const occupiedSlots: OccupiedSlot[] = (occupied ?? []).map((o: { scheduled_at: string; duration_minutes: number }) => ({
      scheduledAt: o.scheduled_at,
      durationMinutes: o.duration_minutes ?? 30,
    }));

    const rescheduleDuration = currentAppt.duration_minutes ?? 30;
    const available = computeSlots(newDate, slotRules, occupiedSlots, clinicTimezone, rescheduleDuration);
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
        scheduled_at: newScheduledAtUtc,
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
      new_value: { scheduled_at: newScheduledAtUtc },
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

    // Staff: dentist + receptionist — scoped by clinic_id
    // Patient: allowed to cancel their own future appointments only
    if (
      profile.role !== "dentist" &&
      profile.role !== "receptionist" &&
      profile.role !== "patient"
    ) {
      return { data: null, error: "Forbidden" };
    }

    // ── Fetch the appointment ─────────────────────────────────────────────
    // For staff: scope by clinic_id.
    // For patients: scope by patient_id (resolved from portal link) via RLS.
    //   RLS already enforces patient_id ownership; we additionally verify it
    //   here server-side using the portal link table for defence-in-depth.
    let appointmentQuery;

    if (profile.role === "patient") {
      // Resolve the patient_id from the portal link
      const { data: linkData } = await db
        .from("patient_portal_links")
        .select("patient_id")
        .eq("user_id", profile.id)
        .single();

      if (!linkData?.patient_id) {
        return { data: null, error: "Portal account not linked." };
      }

      const portalPatientId = (linkData as { patient_id: string }).patient_id;

      appointmentQuery = db
        .from("appointments")
        .select("status, scheduled_at, patient_id")
        .eq("id", appointmentId)
        .eq("patient_id", portalPatientId)   // ownership check
        .is("deleted_at", null)
        .single();
    } else {
      appointmentQuery = db
        .from("appointments")
        .select("status, scheduled_at, patient_id")
        .eq("id", appointmentId)
        .eq("clinic_id", profile.clinic_id)
        .is("deleted_at", null)
        .single();
    }

    const { data: current } = await appointmentQuery;

    if (!current) return { data: null, error: "Appointment not found." };

    const appt = current as { status: string; scheduled_at: string; patient_id: string };

    if (["completed", "cancelled", "no_show"].includes(appt.status)) {
      return { data: null, error: `Cannot cancel a ${appt.status} appointment.` };
    }

    // Patients can only cancel appointments that have not been checked in yet.
    // Once checked in the patient is in the queue — only staff can cancel.
    if (profile.role === "patient" && !["scheduled"].includes(appt.status)) {
      return {
        data: null,
        error: "You can only cancel a scheduled appointment. Please contact the clinic.",
      };
    }

    // Build the update query scoped appropriately per role
    let updateQuery;
    if (profile.role === "patient") {
      const { data: linkData } = await db
        .from("patient_portal_links")
        .select("patient_id")
        .eq("user_id", profile.id)
        .single();
      const portalPatientId = (linkData as { patient_id: string } | null)?.patient_id;
      updateQuery = db
        .from("appointments")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", appointmentId)
        .eq("patient_id", portalPatientId);
    } else {
      updateQuery = db
        .from("appointments")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", appointmentId)
        .eq("clinic_id", profile.clinic_id);
    }

    const { error: updateErr } = await updateQuery;

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

    if (profile.role === "patient") {
      revalidatePath("/portal/appointments");
      revalidatePath(`/portal/appointments/${appointmentId}`);
    } else {
      revalidatePath(`/${profile.role}/appointments`);
      revalidatePath(`/${profile.role}/appointments/${appointmentId}`);
    }

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

    // Fetch clinic timezone so "today" is computed in the clinic's local calendar,
    // not UTC midnight. A clinic in Asia/Kolkata (UTC+5:30) would otherwise miss
    // appointments booked for 00:00–05:30 local time (which are yesterday UTC).
    const { data: settings } = await db
      .from("clinic_settings")
      .select("timezone")
      .eq("clinic_id", profile.clinic_id)
      .maybeSingle();
    const timezone = (settings as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";

    // Compute today's date in the clinic timezone
    const todayInTz = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()); // en-CA locale returns YYYY-MM-DD

    // Convert local day boundaries to UTC using the shared utility
    const { start: startUtc, end: endUtc } = getUtcBoundariesForLocalDate(todayInTz, timezone);

    const { data, error } = await db
      .from("appointments")
      .select("*, patient:patients(id, name, phone)")
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .gte("scheduled_at", startUtc)
      .lte("scheduled_at", endUtc)
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
          .select("*, patient:patients(id, name, phone, date_of_birth, gender)")
          .eq("id", id)
          .is("deleted_at", null)
          .single()
      : db
          .from("appointments")
          .select("*, patient:patients(id, name, phone, date_of_birth, gender)")
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
  /** Optional time-of-day lower bound, e.g. "08:00". Combined with dateFrom. */
  timeFrom?: string;
  /** Optional time-of-day upper bound, e.g. "18:00". Combined with dateTo. */
  timeTo?: string;
  /** Free-text search across patient name + phone. */
  search?: string;
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

    // Guard: an inverted date range (from > to) can never match — return empty
    // rather than running an impossible query.
    if (filters?.dateFrom && filters?.dateTo && filters.dateFrom > filters.dateTo) {
      return { data: { appointments: [], total: 0 }, error: null };
    }

    const search = filters?.search?.trim();

    let query = db
      .from("appointments")
      .select("*, patient:patients(id, name, phone, date_of_birth, gender)", { count: "exact" })
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: false });

    // Staff: scope to clinic_id.
    // Patient: resolve patient_id from portal link and filter explicitly.
    //          This is defence-in-depth alongside RLS — ensures the portal
    //          user only sees their own appointments.
    if (profile.role === "patient") {
      const { data: linkData } = await db
        .from("patient_portal_links")
        .select("patient_id")
        .eq("user_id", profile.id)
        .single();
      const portalPatientId = (linkData as { patient_id: string } | null)?.patient_id;
      if (!portalPatientId) {
        return { data: { appointments: [], total: 0 }, error: null };
      }
      query = query.eq("patient_id", portalPatientId);
    } else {
      query = query.eq("clinic_id", profile.clinic_id);

      // Free-text search on patient name or phone: resolve matching patient
      // ids first, then filter appointments by them. This is reliable across
      // PostgREST versions and avoids embedded-resource filter ambiguity.
      if (search && search.length >= 1) {
        const escaped = search.replace(/[%,()]/g, " ");
        const { data: matched } = await db
          .from("patients")
          .select("id")
          .eq("clinic_id", profile.clinic_id)
          .is("deleted_at", null)
          .or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%`)
          .limit(500);
        const ids = ((matched ?? []) as { id: string }[]).map((p) => p.id);
        if (ids.length === 0) {
          return { data: { appointments: [], total: 0 }, error: null };
        }
        query = query.in("patient_id", ids);
      }
    }

    if (filters?.status) query = query.eq("status", filters.status);

    // Date + time filtering: combine date and time parts into a full datetime string.
    // timeFrom/timeTo are "HH:MM" strings from the filter bar.
    const fromTime = filters?.timeFrom || "00:00:00";
    const toTime = filters?.timeTo ? `${filters.timeTo}:59` : "23:59:59";
    if (filters?.dateFrom) query = query.gte("scheduled_at", `${filters.dateFrom}T${fromTime}`);
    if (filters?.dateTo) query = query.lte("scheduled_at", `${filters.dateTo}T${toTime}`);

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
