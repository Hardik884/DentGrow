"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import {
  CreatePatientSchema,
  UpdatePatientSchema,
  type ActionResult,
  type Patient,
  type PatientFull,
  type FollowUp,
} from "@/types";

/**
 * Patient Server Actions
 *
 * Security rules (enforced in every action):
 * - clinic_id is ALWAYS sourced from the server session (profiles.clinic_id).
 *   Client-supplied clinic_id values are ignored.
 * - Role is resolved server-side on every call.
 * - Soft-delete: all queries filter WHERE deleted_at IS NULL.
 * - Dentist: full CRUD. Receptionist: create + read + update. No delete.
 *
 * Return type: ActionResult<T> = { data: T | null; error: string | null }
 *
 * Note on Supabase typing: the @supabase/ssr createServerClient wraps the
 * underlying typed client in a way that causes TypeScript to infer `never`
 * for some table types in strict mode. Data layer calls are cast via
 * `supabase as unknown as DbClient` to preserve type safety on the
 * application boundary while working around this SSR-wrapper limitation.
 */

// Internal DB client type — matches the underlying @supabase/supabase-js client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

// =============================================================================
// resolveSession — shared session + profile resolution
// =============================================================================

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

  return {
    db,
    profile: (data as ResolvedProfile | null) ?? null,
  };
}

// =============================================================================
// createPatient
// =============================================================================

export async function createPatient(
  input: unknown
): Promise<ActionResult<Patient>> {
  try {
    const parsed = CreatePatientSchema.safeParse(input);
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

    const { data, error } = await db
      .from("patients")
      .insert({
        clinic_id: profile.clinic_id,
        created_by: profile.id,
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        date_of_birth: parsed.data.date_of_birth || null,
        gender: parsed.data.gender ?? null,
        address: parsed.data.address || null,
        emergency_contact_name: parsed.data.emergency_contact_name || null,
        emergency_contact_phone: parsed.data.emergency_contact_phone || null,
        notes: parsed.data.notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[createPatient]", error);
      return { data: null, error: "Failed to create patient." };
    }

    revalidatePath(`/${profile.role}/patients`);
    return { data: data as Patient, error: null };
  } catch (err) {
    console.error("[createPatient] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// updatePatient
// =============================================================================

export async function updatePatient(
  id: string,
  input: unknown
): Promise<ActionResult<Patient>> {
  try {
    if (!id) return { data: null, error: "Patient ID is required" };

    const parsed = UpdatePatientSchema.safeParse(input);
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

    // Build update payload — only include provided fields
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone || null;
    if (parsed.data.date_of_birth !== undefined) updates.date_of_birth = parsed.data.date_of_birth || null;
    if (parsed.data.gender !== undefined) updates.gender = parsed.data.gender ?? null;
    if (parsed.data.address !== undefined) updates.address = parsed.data.address || null;
    if (parsed.data.emergency_contact_name !== undefined) updates.emergency_contact_name = parsed.data.emergency_contact_name || null;
    if (parsed.data.emergency_contact_phone !== undefined) updates.emergency_contact_phone = parsed.data.emergency_contact_phone || null;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes || null;

    const { data, error } = await db
      .from("patients")
      .update(updates)
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) {
      console.error("[updatePatient]", error);
      return { data: null, error: "Failed to update patient." };
    }
    if (!data) return { data: null, error: "Patient not found." };

    revalidatePath(`/${profile.role}/patients`);
    revalidatePath(`/${profile.role}/patients/${id}`);
    revalidatePath(`/dentist/patients/${id}/edit`);
    revalidatePath(`/receptionist/patients/${id}/edit`);

    return { data: data as Patient, error: null };
  } catch (err) {
    console.error("[updatePatient] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// softDeletePatient — dentist only; cascades to related records
// =============================================================================

export async function softDeletePatient(
  id: string
): Promise<ActionResult<null>> {
  try {
    if (!id) return { data: null, error: "Patient ID is required" };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can delete patients." };
    }

    const now = new Date().toISOString();
    const cid = profile.clinic_id;

    // Cascade soft-delete related records first, then the patient itself
    const { error: apptErr } = await db
      .from("appointments")
      .update({ deleted_at: now })
      .eq("patient_id", id)
      .eq("clinic_id", cid)
      .is("deleted_at", null);
    if (apptErr) {
      console.error("[softDeletePatient] appointments:", apptErr);
      return { data: null, error: "Failed to cascade delete." };
    }

    const { error: txErr } = await db
      .from("treatments")
      .update({ deleted_at: now })
      .eq("patient_id", id)
      .eq("clinic_id", cid)
      .is("deleted_at", null);
    if (txErr) {
      console.error("[softDeletePatient] treatments:", txErr);
      return { data: null, error: "Failed to cascade delete." };
    }

    const { error: pyErr } = await db
      .from("payments")
      .update({ deleted_at: now })
      .eq("patient_id", id)
      .eq("clinic_id", cid)
      .is("deleted_at", null);
    if (pyErr) {
      console.error("[softDeletePatient] payments:", pyErr);
      return { data: null, error: "Failed to cascade delete." };
    }

    const { error: fuErr } = await db
      .from("follow_ups")
      .update({ deleted_at: now })
      .eq("patient_id", id)
      .eq("clinic_id", cid)
      .is("deleted_at", null);
    if (fuErr) {
      console.error("[softDeletePatient] follow_ups:", fuErr);
      return { data: null, error: "Failed to cascade delete." };
    }

    const { error: patErr } = await db
      .from("patients")
      .update({ deleted_at: now })
      .eq("id", id)
      .eq("clinic_id", cid)
      .is("deleted_at", null);
    if (patErr) {
      console.error("[softDeletePatient] patient:", patErr);
      return { data: null, error: "Failed to delete patient." };
    }

    revalidatePath("/dentist/patients");

    return { data: null, error: null };
  } catch (err) {
    console.error("[softDeletePatient] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// searchPatients — name + phone partial match (ilike; backed by trigram index)
// =============================================================================

export async function searchPatients(
  query: string
): Promise<ActionResult<Patient[]>> {
  try {
    const trimmed = query?.trim() ?? "";
    if (trimmed.length < 2) return { data: [], error: null };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role === "patient") {
      return { data: null, error: "Forbidden" };
    }

    const { data, error } = await db
      .from("patients")
      .select("*")
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .or(`name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`)
      .order("name")
      .limit(20);

    if (error) {
      console.error("[searchPatients]", error);
      return { data: null, error: "Search failed." };
    }

    return { data: (data ?? []) as Patient[], error: null };
  } catch (err) {
    console.error("[searchPatients] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getPatient — single patient with outstanding balance + pending follow-ups
// =============================================================================

export async function getPatient(
  id: string
): Promise<ActionResult<PatientFull>> {
  try {
    if (!id) return { data: null, error: "Patient ID is required" };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role === "patient") {
      return { data: null, error: "Forbidden" };
    }

    const { data: patient, error: patErr } = await db
      .from("patients")
      .select("*")
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .single();

    if (patErr || !patient) {
      return { data: null, error: "Patient not found." };
    }

    // Compute outstanding balance server-side:
    // SUM(treatments.cost) - SUM(payments.amount)
    const [{ data: treatmentRows }, { data: paymentRows }] = await Promise.all([
      db
        .from("treatments")
        .select("cost")
        .eq("patient_id", id)
        .eq("clinic_id", profile.clinic_id)
        .is("deleted_at", null),
      db
        .from("payments")
        .select("amount")
        .eq("patient_id", id)
        .eq("clinic_id", profile.clinic_id)
        .is("deleted_at", null),
    ]);

    const totalCost = ((treatmentRows ?? []) as { cost: number }[]).reduce(
      (sum, t) => sum + Number(t.cost ?? 0),
      0
    );
    const totalPaid = ((paymentRows ?? []) as { amount: number }[]).reduce(
      (sum, p) => sum + Number(p.amount ?? 0),
      0
    );
    const outstandingBalance = Math.max(0, totalCost - totalPaid);

    // Fetch pending follow-ups
    const { data: followUps } = await db
      .from("follow_ups")
      .select("*")
      .eq("patient_id", id)
      .eq("clinic_id", profile.clinic_id)
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("due_date", { ascending: true });

    const result: PatientFull = {
      ...(patient as Patient),
      outstandingBalance,
      pendingFollowUps: (followUps ?? []) as FollowUp[],
    };

    return { data: result, error: null };
  } catch (err) {
    console.error("[getPatient] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getPatients — paginated list scoped to clinic
// =============================================================================

export async function getPatients(filters?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<ActionResult<{ patients: Patient[]; total: number }>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    if (profile.role === "patient") {
      return { data: null, error: "Forbidden" };
    }

    const page = filters?.page ?? 1;
    const limit = Math.min(filters?.limit ?? 20, 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = db
      .from("patients")
      .select("*", { count: "exact" })
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null);

    if (filters?.search && filters.search.trim().length >= 2) {
      const s = filters.search.trim();
      query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
    }

    const { data, error, count } = await query
      .order("name", { ascending: true })
      .range(from, to);

    if (error) {
      console.error("[getPatients]", error);
      return { data: null, error: "Failed to fetch patients." };
    }

    return {
      data: {
        patients: (data ?? []) as Patient[],
        total: count ?? 0,
      },
      error: null,
    };
  } catch (err) {
    console.error("[getPatients] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getOutstandingBalance — used by OutstandingBalanceBadge
// =============================================================================

export async function getOutstandingBalance(
  patientId: string
): Promise<ActionResult<number>> {
  try {
    if (!patientId) return { data: 0, error: null };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    const [{ data: treatmentRows }, { data: paymentRows }] = await Promise.all([
      db
        .from("treatments")
        .select("cost")
        .eq("patient_id", patientId)
        .eq("clinic_id", profile.clinic_id)
        .is("deleted_at", null),
      db
        .from("payments")
        .select("amount")
        .eq("patient_id", patientId)
        .eq("clinic_id", profile.clinic_id)
        .is("deleted_at", null),
    ]);

    const totalCost = ((treatmentRows ?? []) as { cost: number }[]).reduce(
      (s, t) => s + Number(t.cost ?? 0),
      0
    );
    const totalPaid = ((paymentRows ?? []) as { amount: number }[]).reduce(
      (s, p) => s + Number(p.amount ?? 0),
      0
    );

    return { data: Math.max(0, totalCost - totalPaid), error: null };
  } catch (err) {
    console.error("[getOutstandingBalance] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
