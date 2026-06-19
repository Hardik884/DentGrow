"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import {
  CreateTreatmentSchema,
  UpdateTreatmentSchema,
  type ActionResult,
  type Treatment,
  type TreatmentForReceptionist,
  type TreatmentForPatient,
} from "@/types";

/**
 * Treatment Server Actions
 *
 * Security rules (enforced in every action):
 * - clinic_id is ALWAYS sourced from the server session.
 * - internal_notes are NEVER returned in receptionist or patient paths.
 * - Dentist path: queries base treatments table (full record).
 * - Receptionist path: excludes internal_notes (applied in query).
 * - Patient path: patient_visible_notes only, via patient portal link.
 * - Only dentist can create / update / delete treatments.
 * - Soft-deleted treatments excluded from all default queries.
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

// =============================================================================
// createTreatment — dentist only
// =============================================================================

export async function createTreatment(
  input: unknown
): Promise<ActionResult<Treatment>> {
  try {
    const parsed = CreateTreatmentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message ?? "Invalid input",
      };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can create treatments." };
    }

    const { data, error } = await db
      .from("treatments")
      .insert({
        clinic_id: profile.clinic_id,
        appointment_id: parsed.data.appointment_id,
        patient_id: parsed.data.patient_id,
        treatment_type: parsed.data.treatment_type,
        internal_notes: parsed.data.internal_notes ?? null,
        patient_visible_notes: parsed.data.patient_visible_notes ?? null,
        cost: parsed.data.cost,
        status: parsed.data.status ?? "planned",
        performed_at: parsed.data.performed_at ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("[createTreatment]", error);
      return { data: null, error: "Failed to create treatment." };
    }

    revalidatePath("/dentist/treatments");
    revalidatePath(`/dentist/patients/${parsed.data.patient_id}`);
    revalidatePath(`/dentist/patients/${parsed.data.patient_id}/treatments`);
    revalidatePath(`/dentist/appointments/${parsed.data.appointment_id}`);

    return { data: data as Treatment, error: null };
  } catch (err) {
    console.error("[createTreatment] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// updateTreatment — dentist only
// =============================================================================

export async function updateTreatment(
  id: string,
  input: unknown
): Promise<ActionResult<Treatment>> {
  try {
    if (!id) return { data: null, error: "Treatment ID is required" };

    const parsed = UpdateTreatmentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message ?? "Invalid input",
      };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can update treatments." };
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.treatment_type !== undefined) updates.treatment_type = parsed.data.treatment_type;
    if (parsed.data.internal_notes !== undefined) updates.internal_notes = parsed.data.internal_notes ?? null;
    if (parsed.data.patient_visible_notes !== undefined) updates.patient_visible_notes = parsed.data.patient_visible_notes ?? null;
    if (parsed.data.cost !== undefined) updates.cost = parsed.data.cost;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.performed_at !== undefined) updates.performed_at = parsed.data.performed_at ?? null;

    const { data, error } = await db
      .from("treatments")
      .update(updates)
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) {
      console.error("[updateTreatment]", error);
      return { data: null, error: "Failed to update treatment." };
    }
    if (!data) return { data: null, error: "Treatment not found." };

    const treatment = data as Treatment;

    revalidatePath("/dentist/treatments");
    revalidatePath(`/dentist/treatments/${id}`);
    revalidatePath(`/dentist/patients/${treatment.patient_id}`);
    revalidatePath(`/dentist/patients/${treatment.patient_id}/treatments`);

    return { data: treatment, error: null };
  } catch (err) {
    console.error("[updateTreatment] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// softDeleteTreatment — dentist only
// =============================================================================

export async function softDeleteTreatment(
  id: string
): Promise<ActionResult<null>> {
  try {
    if (!id) return { data: null, error: "Treatment ID is required" };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can delete treatments." };
    }

    // Fetch patient_id for cache invalidation before deleting
    const { data: existing } = await db
      .from("treatments")
      .select("patient_id")
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single();

    const { error } = await db
      .from("treatments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null);

    if (error) {
      console.error("[softDeleteTreatment]", error);
      return { data: null, error: "Failed to delete treatment." };
    }

    revalidatePath("/dentist/treatments");
    if (existing?.patient_id) {
      revalidatePath(`/dentist/patients/${existing.patient_id}`);
      revalidatePath(`/dentist/patients/${existing.patient_id}/treatments`);
    }

    return { data: null, error: null };
  } catch (err) {
    console.error("[softDeleteTreatment] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getTreatment — single treatment by id (dentist only — full record)
// =============================================================================

export async function getTreatment(
  id: string
): Promise<ActionResult<Treatment>> {
  try {
    if (!id) return { data: null, error: "Treatment ID is required" };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden" };
    }

    const { data, error } = await db
      .from("treatments")
      .select("*")
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single();

    if (error || !data) {
      return { data: null, error: "Treatment not found." };
    }

    return { data: data as Treatment, error: null };
  } catch (err) {
    console.error("[getTreatment] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getTreatmentsForPatient — list by patient, role-aware
// Dentist: full record (internal_notes included)
// Receptionist: internal_notes excluded
// =============================================================================

export async function getTreatmentsForPatient(
  patientId: string
): Promise<ActionResult<Treatment[] | TreatmentForReceptionist[]>> {
  try {
    if (!patientId) return { data: [], error: null };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role === "patient") {
      return { data: null, error: "Forbidden" };
    }

    const selectFields =
      profile.role === "dentist"
        ? "*"
        : "id, clinic_id, appointment_id, patient_id, treatment_type, patient_visible_notes, cost, status, performed_at, deleted_at, created_at, updated_at";

    const { data, error } = await db
      .from("treatments")
      .select(selectFields)
      .eq("patient_id", patientId)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getTreatmentsForPatient]", error);
      return { data: null, error: "Failed to fetch treatments." };
    }

    return { data: (data ?? []) as Treatment[], error: null };
  } catch (err) {
    console.error("[getTreatmentsForPatient] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getTreatmentsForAppointment — list by appointment, role-aware
// =============================================================================

export async function getTreatmentsForAppointment(
  appointmentId: string
): Promise<ActionResult<Treatment[] | TreatmentForReceptionist[]>> {
  try {
    if (!appointmentId) return { data: [], error: null };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role === "patient") {
      return { data: null, error: "Forbidden" };
    }

    const selectFields =
      profile.role === "dentist"
        ? "*"
        : "id, clinic_id, appointment_id, patient_id, treatment_type, patient_visible_notes, cost, status, performed_at, deleted_at, created_at, updated_at";

    const { data, error } = await db
      .from("treatments")
      .select(selectFields)
      .eq("appointment_id", appointmentId)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getTreatmentsForAppointment]", error);
      return { data: null, error: "Failed to fetch treatments." };
    }

    return { data: (data ?? []) as Treatment[], error: null };
  } catch (err) {
    console.error("[getTreatmentsForAppointment] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getAllTreatments — clinic-wide list for /dentist/treatments page
// =============================================================================

export async function getAllTreatments(filters?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}): Promise<ActionResult<{ treatments: Treatment[]; total: number }>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden" };
    }

    const page = filters?.page ?? 1;
    const limit = Math.min(filters?.limit ?? 20, 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = db
      .from("treatments")
      .select(
        "*, patients!inner(id, name, phone)",
        { count: "exact" }
      )
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null);

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.search && filters.search.trim().length >= 2) {
      query = query.ilike("treatment_type", `%${filters.search.trim()}%`);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("[getAllTreatments]", error);
      return { data: null, error: "Failed to fetch treatments." };
    }

    return {
      data: {
        treatments: (data ?? []) as Treatment[],
        total: count ?? 0,
      },
      error: null,
    };
  } catch (err) {
    console.error("[getAllTreatments] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getPatientTreatments — patient portal path; patient_visible_notes only
// =============================================================================

export async function getPatientTreatments(
  _patientId: string
): Promise<ActionResult<TreatmentForPatient[]>> {
  try {
    const supabase = await createServerClient();
    const db: DbClient = supabase;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Unauthorized" };

    // Resolve patient_id via portal link
    const { data: link } = await db
      .from("patient_portal_links")
      .select("patient_id")
      .eq("user_id", user.id)
      .single();

    if (!link?.patient_id) {
      return { data: null, error: "Portal account not linked." };
    }

    const { data, error } = await db
      .from("treatments")
      .select(
        "id, clinic_id, appointment_id, patient_id, treatment_type, patient_visible_notes, cost, status, performed_at, created_at"
      )
      .eq("patient_id", link.patient_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getPatientTreatments]", error);
      return { data: null, error: "Failed to fetch treatments." };
    }

    return { data: (data ?? []) as TreatmentForPatient[], error: null };
  } catch (err) {
    console.error("[getPatientTreatments] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
