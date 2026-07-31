"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSession as resolveCachedSession } from "@/lib/auth/session";
import { computeOutstandingBalance } from "@/lib/billing/balance";
import { getTodayInTimezone, getUtcBoundariesForLocalDate } from "@/lib/utils";
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
  const { db, profile } = await resolveCachedSession();
  return { db, profile };
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
      // Log the complete Supabase error with all details
      console.error("[updatePatient] Supabase error:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        patient_id: id,
        clinic_id: profile.clinic_id,
        role: profile.role,
      });
      
      // Return a more informative error message
      const errorMsg = error.message || error.details || error.hint || "Failed to update patient.";
      return { data: null, error: `Update failed: ${errorMsg}` };
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

    // Authorization is fully resolved above (role === 'dentist', clinic_id scoped).
    // The cascade writes use the admin client (service-role) so they are not
    // subject to RLS policy evaluation. This is the correct pattern for
    // server-side privileged operations that have already been authorized in
    // application code — identical to how portal-link.ts handles its writes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: DbClient = createAdminClient();

    // Cascade soft-delete related records first, then the patient itself.
    // Each step surfaces the real Supabase/DB error so the exact failing
    // table and constraint are visible in server logs and returned to the caller.

    const { error: apptErr } = await admin
      .from("appointments")
      .update({ deleted_at: now })
      .eq("patient_id", id)
      .eq("clinic_id", cid)
      .is("deleted_at", null);
    if (apptErr) {
      const msg = `appointments: ${apptErr.message ?? apptErr.code ?? JSON.stringify(apptErr)}`;
      console.error("[softDeletePatient]", msg, apptErr);
      return { data: null, error: `Failed to cascade delete (${msg}).` };
    }

    const { error: txErr } = await admin
      .from("treatments")
      .update({ deleted_at: now })
      .eq("patient_id", id)
      .eq("clinic_id", cid)
      .is("deleted_at", null);
    if (txErr) {
      const msg = `treatments: ${txErr.message ?? txErr.code ?? JSON.stringify(txErr)}`;
      console.error("[softDeletePatient]", msg, txErr);
      return { data: null, error: `Failed to cascade delete (${msg}).` };
    }

    const { error: pyErr } = await admin
      .from("payments")
      .update({ deleted_at: now })
      .eq("patient_id", id)
      .eq("clinic_id", cid)
      .is("deleted_at", null);
    if (pyErr) {
      const msg = `payments: ${pyErr.message ?? pyErr.code ?? JSON.stringify(pyErr)}`;
      console.error("[softDeletePatient]", msg, pyErr);
      return { data: null, error: `Failed to cascade delete (${msg}).` };
    }

    const { error: fuErr } = await admin
      .from("follow_ups")
      .update({ deleted_at: now })
      .eq("patient_id", id)
      .eq("clinic_id", cid)
      .is("deleted_at", null);
    if (fuErr) {
      const msg = `follow_ups: ${fuErr.message ?? fuErr.code ?? JSON.stringify(fuErr)}`;
      console.error("[softDeletePatient]", msg, fuErr);
      return { data: null, error: `Failed to cascade delete (${msg}).` };
    }

    // Remove any active queue entries for this patient. queue_entries has no
    // soft-delete column — hard-delete waiting/in_progress entries to keep the
    // live queue clean. completed entries are left for audit.
    const { error: qErr } = await admin
      .from("queue_entries")
      .delete()
      .eq("patient_id", id)
      .eq("clinic_id", cid)
      .in("status", ["waiting", "in_progress"]);
    if (qErr) {
      const msg = `queue_entries: ${qErr.message ?? qErr.code ?? JSON.stringify(qErr)}`;
      console.error("[softDeletePatient]", msg, qErr);
      return { data: null, error: `Failed to cascade delete (${msg}).` };
    }

    // Remove the patient portal link (if any). The link table has no
    // soft-delete column and its patient_id/user_id are UNIQUE. Leaving a
    // dangling link pointing at a soft-deleted patient would let the linked
    // auth account log into a broken portal (every patient-scoped query filters
    // deleted_at IS NULL, so the patient would resolve to "not found"). Hard-
    // delete the link so the account is cleanly unlinked. The patient's
    // clinical rows are retained (soft-deleted) for audit.
    const { error: linkErr } = await admin
      .from("patient_portal_links")
      .delete()
      .eq("patient_id", id);
    if (linkErr) {
      const msg = `patient_portal_links: ${linkErr.message ?? linkErr.code ?? JSON.stringify(linkErr)}`;
      console.error("[softDeletePatient]", msg, linkErr);
      return { data: null, error: `Failed to cascade delete (${msg}).` };
    }

    const { error: patErr } = await admin
      .from("patients")
      .update({ deleted_at: now })
      .eq("id", id)
      .eq("clinic_id", cid)
      .is("deleted_at", null);
    if (patErr) {
      const msg = `patient: ${patErr.message ?? patErr.code ?? JSON.stringify(patErr)}`;
      console.error("[softDeletePatient]", msg, patErr);
      return { data: null, error: `Failed to delete patient (${msg}).` };
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

/**
 * sanitizeForOrFilter — escape PostgREST `or()` filter operators.
 *
 * The `or()` filter expects: `name.ilike.%foo%,phone.ilike.%foo%`
 * If user input contains `,`, `(`, `)`, `%`, or `*`, it can break the parser
 * or in some cases inject unintended filter terms. We strip those characters
 * (they have no useful meaning in a name/phone search anyway) before composing
 * the filter string.
 */
function sanitizeForOrFilter(input: string): string {
  return input.replace(/[,()%*\\]/g, " ").trim();
}

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

    const safe = sanitizeForOrFilter(trimmed);
    if (safe.length < 2) return { data: [], error: null };

    const { data, error } = await db
      .from("patients")
      .select("*")
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
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

    // Compute outstanding balance server-side via the shared helper:
    // SUM(billable treatments.cost) - SUM(payments.amount).
    const [{ data: treatmentRows }, { data: paymentRows }] = await Promise.all([
      db
        .from("treatments")
        .select("cost, status")
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

    const outstandingBalance = computeOutstandingBalance(
      (treatmentRows ?? []) as { cost: number; status: string }[],
      (paymentRows ?? []) as { amount: number }[]
    );

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
  /** Quick-filter category: new | visits-today | active | inactive */
  filter?: string;
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
      const s = sanitizeForOrFilter(filters.search.trim());
      if (s.length >= 2) {
        query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
      }
    }

    // Quick-filter categories. "active" = seen in the last 180 days;
    // "inactive" = no visit in the last 180 days; "new" = registered today;
    // "visits-today" = has an appointment scheduled today. All computed in the
    // clinic timezone so boundaries match the rest of the app.
    const cat = filters?.filter;
    if (cat === "new" || cat === "visits-today" || cat === "active" || cat === "inactive") {
      const { data: settings } = await db
        .from("clinic_settings")
        .select("timezone")
        .eq("clinic_id", profile.clinic_id)
        .maybeSingle();
      const tz = (settings as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";
      const today = getTodayInTimezone(tz);

      if (cat === "new") {
        const { start } = getUtcBoundariesForLocalDate(today, tz);
        query = query.gte("created_at", start);
      } else if (cat === "visits-today") {
        const { start, end } = getUtcBoundariesForLocalDate(today, tz);
        const { data: appts } = await db
          .from("appointments")
          .select("patient_id")
          .eq("clinic_id", profile.clinic_id)
          .is("deleted_at", null)
          .gte("scheduled_at", start)
          .lte("scheduled_at", end);
        const ids = Array.from(
          new Set(((appts ?? []) as { patient_id: string }[]).map((a) => a.patient_id))
        );
        if (ids.length === 0) return { data: { patients: [], total: 0 }, error: null };
        query = query.in("id", ids);
      } else {
        // active / inactive — resolve patients seen in the last 180 days.
        const cutoff = new Date(`${today}T00:00:00`);
        cutoff.setDate(cutoff.getDate() - 180);
        const cutoffIso = cutoff.toISOString();
        const { data: appts } = await db
          .from("appointments")
          .select("patient_id")
          .eq("clinic_id", profile.clinic_id)
          .is("deleted_at", null)
          .gte("scheduled_at", cutoffIso);
        const activeIds = Array.from(
          new Set(((appts ?? []) as { patient_id: string }[]).map((a) => a.patient_id))
        );
        if (cat === "active") {
          if (activeIds.length === 0) return { data: { patients: [], total: 0 }, error: null };
          query = query.in("id", activeIds);
        } else if (activeIds.length > 0) {
          query = query.not("id", "in", `(${activeIds.join(",")})`);
        }
      }
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
        .select("cost, status")
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

    return {
      data: computeOutstandingBalance(
        (treatmentRows ?? []) as { cost: number; status: string }[],
        (paymentRows ?? []) as { amount: number }[]
      ),
      error: null,
    };
  } catch (err) {
    console.error("[getOutstandingBalance] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
