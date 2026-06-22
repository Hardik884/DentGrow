"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { getTodayInTimezone } from "@/lib/utils";
import {
  CreateFollowUpSchema,
  UpdateFollowUpSchema,
  type ActionResult,
  type FollowUp,
  type FollowUpWithRelations,
} from "@/types";

/**
 * Follow-Up Server Actions
 *
 * Security rules (enforced in every action):
 * - clinic_id is ALWAYS sourced from the server session.
 * - Dentist: full CRUD (create, update, complete, cancel, list).
 * - Receptionist: create, update, view — cannot cancel or complete.
 * - Patient: view own follow-ups only (via portal link).
 * - Overdue = due_date < today AND status = 'pending'.
 * - Soft-deleted follow-ups excluded from all queries.
 *
 * Validation guards:
 * - patient must exist and belong to the clinic
 * - appointment_id (if provided) must belong to the patient
 * - treatment_id (if provided) must belong to the patient
 * - due_date must be a valid date string
 * - follow_up_type is required
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

type ResolvedProfile = {
  id: string;
  clinic_id: string;
  role: "dentist" | "receptionist" | "patient";
};

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

/**
 * todayForClinic — today's date (YYYY-MM-DD) in the clinic's local timezone.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todayForClinic(db: any, clinicId: string): Promise<string> {
  if (!clinicId) return new Date().toISOString().split("T")[0];
  const { data } = await db
    .from("clinic_settings")
    .select("timezone")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  const tz = (data as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";
  return getTodayInTimezone(tz);
}

// =============================================================================
// createFollowUp — dentist + receptionist
// =============================================================================

export async function createFollowUp(
  input: unknown
): Promise<ActionResult<FollowUp>> {
  try {
    const parsed = CreateFollowUpSchema.safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message ?? "Invalid input",
      };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role === "patient") {
      return { data: null, error: "Forbidden: patients cannot create follow-ups." };
    }

    // ── Validate patient, appointment, treatment, and timezone in parallel ────
    // Previously these were fired sequentially. All four are independent reads
    // so they can safely run in parallel.
    const [patientRow, apptRow, txRow, today] = await Promise.all([
      db
        .from("patients")
        .select("id")
        .eq("id", parsed.data.patient_id)
        .eq("clinic_id", profile.clinic_id)
        .is("deleted_at", null)
        .single()
        .then((r: { data: unknown }) => r.data),

      parsed.data.appointment_id
        ? db
            .from("appointments")
            .select("id")
            .eq("id", parsed.data.appointment_id)
            .eq("patient_id", parsed.data.patient_id)
            .eq("clinic_id", profile.clinic_id)
            .is("deleted_at", null)
            .single()
            .then((r: { data: unknown }) => r.data)
        : Promise.resolve(true), // no appointment to validate → pass-through

      parsed.data.treatment_id
        ? db
            .from("treatments")
            .select("id")
            .eq("id", parsed.data.treatment_id)
            .eq("patient_id", parsed.data.patient_id)
            .eq("clinic_id", profile.clinic_id)
            .is("deleted_at", null)
            .single()
            .then((r: { data: unknown }) => r.data)
        : Promise.resolve(true), // no treatment to validate → pass-through

      todayForClinic(db, profile.clinic_id),
    ]);

    if (!patientRow) {
      return { data: null, error: "Patient not found in this clinic." };
    }

    if (parsed.data.appointment_id && !apptRow) {
      return {
        data: null,
        error: "Appointment not found or does not belong to this patient.",
      };
    }

    if (parsed.data.treatment_id && !txRow) {
      return {
        data: null,
        error: "Treatment not found or does not belong to this patient.",
      };
    }

    // ── Validate due_date is not in the past ───────────────────────────────
    if (parsed.data.due_date < today) {
      return { data: null, error: "Due date cannot be in the past." };
    }

    const { data, error } = await db
      .from("follow_ups")
      .insert({
        clinic_id:      profile.clinic_id,
        patient_id:     parsed.data.patient_id,
        appointment_id: parsed.data.appointment_id ?? null,
        treatment_id:   parsed.data.treatment_id ?? null,
        follow_up_type: parsed.data.follow_up_type,
        due_date:       parsed.data.due_date,
        status:         "pending",
        notes:          parsed.data.notes ?? null,
        created_by:     profile.id,
      })
      .select()
      .single();

    if (error) {
      console.error("[createFollowUp]", error);
      return { data: null, error: "Failed to create follow-up." };
    }

    revalidatePath("/dentist/follow-ups");
    revalidatePath(`/dentist/patients/${parsed.data.patient_id}`);

    return { data: data as FollowUp, error: null };
  } catch (err) {
    console.error("[createFollowUp] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// updateFollowUp — dentist + receptionist
// =============================================================================

export async function updateFollowUp(
  id: string,
  input: unknown
): Promise<ActionResult<FollowUp>> {
  try {
    if (!id) return { data: null, error: "Follow-up ID is required" };

    const parsed = UpdateFollowUpSchema.safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message ?? "Invalid input",
      };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role === "patient") {
      return { data: null, error: "Forbidden" };
    }

    // Fetch the existing follow-up to resolve patient_id for cross-checks
    const { data: existing } = await db
      .from("follow_ups")
      .select("id, patient_id, status")
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single();

    if (!existing) return { data: null, error: "Follow-up not found." };

    const patientId: string = (existing as { patient_id: string }).patient_id;

    // ── Validate appointment belongs to this patient (if being updated) ────
    if (parsed.data.appointment_id) {
      const { data: apptRow } = await db
        .from("appointments")
        .select("id")
        .eq("id", parsed.data.appointment_id)
        .eq("patient_id", patientId)
        .eq("clinic_id", profile.clinic_id)
        .is("deleted_at", null)
        .single();

      if (!apptRow) {
        return {
          data: null,
          error: "Appointment not found or does not belong to this patient.",
        };
      }
    }

    // ── Validate treatment belongs to this patient (if being updated) ──────
    if (parsed.data.treatment_id) {
      const { data: txRow } = await db
        .from("treatments")
        .select("id")
        .eq("id", parsed.data.treatment_id)
        .eq("patient_id", patientId)
        .eq("clinic_id", profile.clinic_id)
        .is("deleted_at", null)
        .single();

      if (!txRow) {
        return {
          data: null,
          error: "Treatment not found or does not belong to this patient.",
        };
      }
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.follow_up_type !== undefined) updates.follow_up_type = parsed.data.follow_up_type;
    if (parsed.data.due_date !== undefined)        updates.due_date        = parsed.data.due_date;
    if (parsed.data.notes !== undefined)           updates.notes           = parsed.data.notes ?? null;
    if (parsed.data.appointment_id !== undefined)  updates.appointment_id  = parsed.data.appointment_id ?? null;
    if (parsed.data.treatment_id !== undefined)    updates.treatment_id    = parsed.data.treatment_id ?? null;
    if (parsed.data.status !== undefined)          updates.status          = parsed.data.status;

    const { data, error } = await db
      .from("follow_ups")
      .update(updates)
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) {
      console.error("[updateFollowUp]", error);
      return { data: null, error: "Failed to update follow-up." };
    }
    if (!data) return { data: null, error: "Follow-up not found." };

    const followUp = data as FollowUp;

    revalidatePath("/dentist/follow-ups");
    revalidatePath(`/dentist/follow-ups/${id}`);
    revalidatePath(`/dentist/patients/${followUp.patient_id}`);

    return { data: followUp, error: null };
  } catch (err) {
    console.error("[updateFollowUp] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// completeFollowUp — dentist only
// =============================================================================

export async function completeFollowUp(
  id: string
): Promise<ActionResult<FollowUp>> {
  try {
    if (!id) return { data: null, error: "Follow-up ID is required" };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can complete follow-ups." };
    }

    const { data, error } = await db
      .from("follow_ups")
      .update({
        status:     "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .eq("status", "pending")
      .is("deleted_at", null)
      .select()
      .single();

    if (error) {
      console.error("[completeFollowUp]", error);
      return { data: null, error: "Failed to complete follow-up." };
    }
    if (!data) return { data: null, error: "Follow-up not found or already completed." };

    const followUp = data as FollowUp;

    revalidatePath("/dentist/follow-ups");
    revalidatePath(`/dentist/follow-ups/${id}`);
    revalidatePath(`/dentist/patients/${followUp.patient_id}`);

    return { data: followUp, error: null };
  } catch (err) {
    console.error("[completeFollowUp] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// cancelFollowUp — dentist only
// =============================================================================

export async function cancelFollowUp(
  id: string
): Promise<ActionResult<FollowUp>> {
  try {
    if (!id) return { data: null, error: "Follow-up ID is required" };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can cancel follow-ups." };
    }

    const { data, error } = await db
      .from("follow_ups")
      .update({
        status:     "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .eq("status", "pending")
      .is("deleted_at", null)
      .select()
      .single();

    if (error) {
      console.error("[cancelFollowUp]", error);
      return { data: null, error: "Failed to cancel follow-up." };
    }
    if (!data) return { data: null, error: "Follow-up not found or not pending." };

    const followUp = data as FollowUp;

    revalidatePath("/dentist/follow-ups");
    revalidatePath(`/dentist/follow-ups/${id}`);
    revalidatePath(`/dentist/patients/${followUp.patient_id}`);

    return { data: followUp, error: null };
  } catch (err) {
    console.error("[cancelFollowUp] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getFollowUp — single follow-up by id with relations (staff only)
// =============================================================================

export async function getFollowUp(
  id: string
): Promise<ActionResult<FollowUpWithRelations>> {
  try {
    if (!id) return { data: null, error: "Follow-up ID is required" };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role === "patient") {
      return { data: null, error: "Forbidden" };
    }

    const { data, error } = await db
      .from("follow_ups")
      .select(
        "*, " +
        "patient:patients(id, name, phone), " +
        "appointment:appointments(id, scheduled_at, status), " +
        "treatment:treatments(id, treatment_type, status)"
      )
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single();

    if (error || !data) {
      return { data: null, error: "Follow-up not found." };
    }

    return { data: data as FollowUpWithRelations, error: null };
  } catch (err) {
    console.error("[getFollowUp] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getFollowUpsForPatient — all follow-ups for a patient profile (staff)
// =============================================================================

export async function getFollowUpsForPatient(
  patientId: string
): Promise<ActionResult<FollowUpWithRelations[]>> {
  try {
    if (!patientId) return { data: [], error: null };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role === "patient") {
      return { data: null, error: "Forbidden" };
    }

    const { data, error } = await db
      .from("follow_ups")
      .select(
        "*, " +
        "patient:patients(id, name, phone), " +
        "appointment:appointments(id, scheduled_at, status), " +
        "treatment:treatments(id, treatment_type, status)"
      )
      .eq("patient_id", patientId)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .order("due_date", { ascending: true });

    if (error) {
      console.error("[getFollowUpsForPatient]", error);
      return { data: null, error: "Failed to fetch follow-ups." };
    }

    return { data: (data ?? []) as FollowUpWithRelations[], error: null };
  } catch (err) {
    console.error("[getFollowUpsForPatient] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getAllFollowUps — clinic-wide list for /dentist/follow-ups dashboard
// Overdue follow-ups first, then by due_date ascending.
// Accepts optional status filter.
// =============================================================================

export async function getAllFollowUps(filters?: {
  status?: "pending" | "completed" | "cancelled" | "overdue";
  page?: number;
  limit?: number;
}): Promise<ActionResult<{ followUps: FollowUpWithRelations[]; total: number }>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role === "patient") {
      return { data: null, error: "Forbidden" };
    }

    const page  = filters?.page ?? 1;
    const limit = Math.min(filters?.limit ?? 50, 100);
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    const today = await todayForClinic(db, profile.clinic_id);

    let query = db
      .from("follow_ups")
      .select(
        "*, " +
        "patient:patients(id, name, phone), " +
        "appointment:appointments(id, scheduled_at, status), " +
        "treatment:treatments(id, treatment_type, status)",
        { count: "exact" }
      )
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null);

    if (filters?.status === "overdue") {
      query = query.eq("status", "pending").lt("due_date", today);
    } else if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    const { data, error, count } = await query
      .order("due_date", { ascending: true })
      .range(from, to);

    if (error) {
      console.error("[getAllFollowUps]", error);
      return { data: null, error: "Failed to fetch follow-ups." };
    }

    return {
      data: {
        followUps: (data ?? []) as FollowUpWithRelations[],
        total: count ?? 0,
      },
      error: null,
    };
  } catch (err) {
    console.error("[getAllFollowUps] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getOverdueFollowUps — dentist dashboard + analytics
// =============================================================================

export async function getOverdueFollowUps(): Promise<
  ActionResult<FollowUpWithRelations[]>
> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role === "patient") {
      return { data: null, error: "Forbidden" };
    }

    const today = await todayForClinic(db, profile.clinic_id);

    const { data, error } = await db
      .from("follow_ups")
      .select(
        "*, " +
        "patient:patients(id, name, phone), " +
        "appointment:appointments(id, scheduled_at, status), " +
        "treatment:treatments(id, treatment_type, status)"
      )
      .eq("clinic_id", profile.clinic_id)
      .eq("status", "pending")
      .lt("due_date", today)
      .is("deleted_at", null)
      .order("due_date", { ascending: true });

    if (error) {
      console.error("[getOverdueFollowUps]", error);
      return { data: null, error: "Failed to fetch overdue follow-ups." };
    }

    return {
      data: (data ?? []) as FollowUpWithRelations[],
      error: null,
    };
  } catch (err) {
    console.error("[getOverdueFollowUps] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getPatientAppointments — fetch appointments for a patient (used by form)
// Returns lightweight list for the appointment selector in the follow-up form.
// =============================================================================

export async function getPatientAppointmentsForFollowUp(
  patientId: string
): Promise<ActionResult<Array<{ id: string; scheduled_at: string; status: string }>>> {
  try {
    if (!patientId) return { data: [], error: null };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role === "patient") return { data: null, error: "Forbidden" };

    const { data, error } = await db
      .from("appointments")
      .select("id, scheduled_at, status")
      .eq("patient_id", patientId)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .not("status", "in", '("cancelled","no_show")')
      .order("scheduled_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[getPatientAppointmentsForFollowUp]", error);
      return { data: null, error: "Failed to fetch appointments." };
    }

    return {
      data: (data ?? []) as Array<{ id: string; scheduled_at: string; status: string }>,
      error: null,
    };
  } catch (err) {
    console.error("[getPatientAppointmentsForFollowUp] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getPatientTreatmentsForFollowUp — fetch treatments for a patient (used by form)
// =============================================================================

export async function getPatientTreatmentsForFollowUp(
  patientId: string
): Promise<ActionResult<Array<{ id: string; treatment_type: string; status: string }>>> {
  try {
    if (!patientId) return { data: [], error: null };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role === "patient") return { data: null, error: "Forbidden" };

    const { data, error } = await db
      .from("treatments")
      .select("id, treatment_type, status")
      .eq("patient_id", patientId)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[getPatientTreatmentsForFollowUp]", error);
      return { data: null, error: "Failed to fetch treatments." };
    }

    return {
      data: (data ?? []) as Array<{ id: string; treatment_type: string; status: string }>,
      error: null,
    };
  } catch (err) {
    console.error("[getPatientTreatmentsForFollowUp] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getPatientPortalFollowUps — patient portal: view own follow-ups only
// =============================================================================

export async function getPatientPortalFollowUps(): Promise<ActionResult<FollowUp[]>> {
  try {
    const supabase = await createServerClient();
    const db: DbClient = supabase;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Unauthorized" };

    const { data: link } = await db
      .from("patient_portal_links")
      .select("patient_id")
      .eq("user_id", user.id)
      .single();

    if (!link?.patient_id) {
      return { data: null, error: "Portal account not linked." };
    }

    const { data, error } = await db
      .from("follow_ups")
      .select("*")
      .eq("patient_id", link.patient_id)
      .is("deleted_at", null)
      .order("due_date", { ascending: true });

    if (error) {
      console.error("[getPatientPortalFollowUps]", error);
      return { data: null, error: "Failed to fetch follow-ups." };
    }

    return { data: (data ?? []) as FollowUp[], error: null };
  } catch (err) {
    console.error("[getPatientPortalFollowUps] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getFollowUpStats — summary counts for dashboard KPIs
// =============================================================================

export async function getFollowUpStats(): Promise<
  ActionResult<{
    pending: number;
    overdue: number;
    completed: number;
    upcoming: number;
  }>
> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role === "patient") {
      return { data: null, error: "Forbidden" };
    }

    const today = await todayForClinic(db, profile.clinic_id);

    const { data, error } = await db
      .from("follow_ups")
      .select("status, due_date")
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null);

    if (error) {
      console.error("[getFollowUpStats]", error);
      return { data: null, error: "Failed to fetch follow-up stats." };
    }

    const rows = (data ?? []) as { status: string; due_date: string }[];

    const stats = { pending: 0, overdue: 0, completed: 0, upcoming: 0 };

    for (const row of rows) {
      if (row.status === "pending") {
        stats.pending++;
        if (row.due_date < today) {
          stats.overdue++;
        } else {
          stats.upcoming++;
        }
      } else if (row.status === "completed") {
        stats.completed++;
      }
    }

    return { data: stats, error: null };
  } catch (err) {
    console.error("[getFollowUpStats] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
