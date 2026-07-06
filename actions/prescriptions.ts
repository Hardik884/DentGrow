"use server";

import { resolveSession as resolveCachedSession } from "@/lib/auth/session";
import type { ActionResult } from "@/types";

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
  const { db, profile } = await resolveCachedSession();
  return { db, profile };
}

/**
 * Prescription record for receptionist view.
 * Reuses existing treatments data where medications array is not empty.
 * Excludes internal_notes and clinical information.
 */
export type PrescriptionRecord = {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  treatment_type: string;
  treatment_date: string;
  dentist_id: string;
  dentist_name: string;
  dentist_registration_number: string | null;
  dentist_signature_url: string | null;
  medications: Array<{
    name: string;
    dosage?: string;
    number: number;
    days: number;
    instructions?: string;
  }>;
  patient_visible_notes: string | null;
  medicine_count: number;
};

/**
 * getPrescriptions — receptionist only
 * 
 * Returns completed treatments containing medicines from the receptionist's clinic.
 * Each treatment with a non-empty medications array is treated as a prescription.
 * Enriched with patient info, dentist info, and signature for prescription printing.
 */
export async function getPrescriptions(filters?: {
  page?: number;
  limit?: number;
  search?: string;
  treatmentType?: string;
  dentistId?: string;
  medicineName?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ActionResult<{ prescriptions: PrescriptionRecord[]; total: number }>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "receptionist") {
      return { data: null, error: "Forbidden: only receptionists can access prescriptions." };
    }

    const page = filters?.page ?? 1;
    const limit = Math.min(filters?.limit ?? 20, 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Guard: inverted date range → return empty immediately
    if (filters?.dateFrom && filters?.dateTo && filters.dateFrom > filters.dateTo) {
      return { data: { prescriptions: [], total: 0 }, error: null };
    }

    const search = filters?.search?.trim();

    // Free-text search: resolve matching patient IDs first
    let patientIdFilter: string[] | null = null;
    if (search && search.length >= 1) {
      const escaped = search.replace(/[%,()]/g, " ");
      const { data: matched } = await db
        .from("patients")
        .select("id")
        .eq("clinic_id", profile.clinic_id)
        .is("deleted_at", null)
        .or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%`)
        .limit(500);
      patientIdFilter = ((matched ?? []) as { id: string }[]).map((p) => p.id);
      if (patientIdFilter.length === 0) {
        return { data: { prescriptions: [], total: 0 }, error: null };
      }
    }

    // Medicine name search: filter by medications JSONB array
    // We need to fetch all matching treatments and filter in-memory due to JSONB array search limitations
    // For better performance, we could add a GIN index on medications in the future

    let query = db
      .from("treatments")
      .select(
        "id, patient_id, treatment_type, performed_at, created_at, patient_visible_notes, medications, appointment_id",
        { count: "exact" }
      )
      .eq("clinic_id", profile.clinic_id)
      .eq("status", "completed")
      .is("deleted_at", null)
      .not("medications", "is", null);

    if (filters?.treatmentType && filters.treatmentType.trim().length >= 1) {
      query = query.ilike("treatment_type", `%${filters.treatmentType.trim()}%`);
    }

    if (patientIdFilter !== null) {
      query = query.in("patient_id", patientIdFilter);
    }

    if (filters?.dateFrom) query = query.gte("performed_at", `${filters.dateFrom}T00:00:00`);
    if (filters?.dateTo)   query = query.lte("performed_at", `${filters.dateTo}T23:59:59`);

    const { data: treatmentRows, error: treatmentError, count: rawCount } = await query
      .order("performed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (treatmentError) {
      console.error("[getPrescriptions] treatments:", treatmentError);
      return { data: null, error: "Failed to fetch prescriptions." };
    }

    let treatments = (treatmentRows ?? []) as Array<{
      id: string;
      patient_id: string;
      treatment_type: string;
      performed_at: string | null;
      created_at: string;
      patient_visible_notes: string | null;
      medications: Array<{
        name: string;
        dosage?: string;
        number: number;
        days: number;
        instructions?: string;
      }> | null;
      appointment_id: string;
    }>;

    // Filter out treatments with empty medications arrays
    treatments = treatments.filter(
      (t) => Array.isArray(t.medications) && t.medications.length > 0
    );

    // Medicine name filter (in-memory)
    if (filters?.medicineName && filters.medicineName.trim().length >= 1) {
      const medSearch = filters.medicineName.trim().toLowerCase();
      treatments = treatments.filter((t) =>
        t.medications?.some((m) => m.name.toLowerCase().includes(medSearch))
      );
    }

    const totalAfterFilters = treatments.length;

    // Pagination
    const paginatedTreatments = treatments.slice(from, to + 1);

    if (paginatedTreatments.length === 0) {
      return { data: { prescriptions: [], total: totalAfterFilters }, error: null };
    }

    // Resolve patient names and phones
    const patientIds = Array.from(new Set(paginatedTreatments.map((t) => t.patient_id)));
    const { data: patientsData } = await db
      .from("patients")
      .select("id, name, phone")
      .in("id", patientIds)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null);

    const patientById = new Map(
      ((patientsData ?? []) as { id: string; name: string; phone: string | null }[]).map((p) => [
        p.id,
        { name: p.name, phone: p.phone },
      ])
    );

    // Resolve dentist info via appointments
    const apptIds = Array.from(
      new Set(paginatedTreatments.map((t) => t.appointment_id))
    );

    const { data: apptsData } = await db
      .from("appointments")
      .select("id, dentist_id")
      .in("id", apptIds)
      .eq("clinic_id", profile.clinic_id);

    const dentistIdByAppt = new Map(
      ((apptsData ?? []) as { id: string; dentist_id: string }[]).map((a) => [
        a.id,
        a.dentist_id,
      ])
    );

    const dentistIds = Array.from(
      new Set(
        Array.from(dentistIdByAppt.values()).filter(Boolean)
      )
    );

    // Dentist filter
    let filteredByDentist = paginatedTreatments;
    if (filters?.dentistId) {
      filteredByDentist = paginatedTreatments.filter((t) => {
        const dentistId = dentistIdByAppt.get(t.appointment_id);
        return dentistId === filters.dentistId;
      });
    }

    if (filteredByDentist.length === 0) {
      return { data: { prescriptions: [], total: 0 }, error: null };
    }

    const { data: dentistsData } = await db
      .from("profiles")
      .select("id, full_name, signature_url")
      .in("id", dentistIds);

    const dentistById = new Map(
      ((dentistsData ?? []) as {
        id: string;
        full_name: string;
        signature_url: string | null;
      }[]).map((d) => [d.id, d])
    );

    // Resolve registration number from clinic_settings
    const { data: settingsData } = await db
      .from("clinic_settings")
      .select("registration_number")
      .eq("clinic_id", profile.clinic_id)
      .maybeSingle();

    const registrationNumber = (settingsData as { registration_number: string | null } | null)
      ?.registration_number ?? null;

    // Build prescription records
    const prescriptions: PrescriptionRecord[] = filteredByDentist
      .map((t) => {
        const patient = patientById.get(t.patient_id);
        const dentistId = dentistIdByAppt.get(t.appointment_id);
        const dentist = dentistId ? dentistById.get(dentistId) : undefined;

        if (!patient || !dentist) return null;

        return {
          id: t.id,
          patient_id: t.patient_id,
          patient_name: patient.name,
          patient_phone: patient.phone,
          treatment_type: t.treatment_type,
          treatment_date: t.performed_at ?? t.created_at,
          dentist_id: dentistId!,
          dentist_name: dentist.full_name,
          dentist_registration_number: registrationNumber,
          dentist_signature_url: dentist.signature_url,
          medications: t.medications ?? [],
          patient_visible_notes: t.patient_visible_notes,
          medicine_count: t.medications?.length ?? 0,
        };
      })
      .filter((p): p is PrescriptionRecord => p !== null);

    return {
      data: {
        prescriptions,
        total: totalAfterFilters,
      },
      error: null,
    };
  } catch (err) {
    console.error("[getPrescriptions] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

/**
 * getDentistList — receptionist only
 * Returns list of dentists in the clinic for filter dropdown
 */
export async function getDentistList(): Promise<
  ActionResult<Array<{ id: string; name: string }>>
> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }

    const { data, error } = await db
      .from("profiles")
      .select("id, full_name")
      .eq("clinic_id", profile.clinic_id)
      .eq("role", "dentist")
      .order("full_name", { ascending: true });

    if (error) {
      console.error("[getDentistList]", error);
      return { data: null, error: "Failed to fetch dentists." };
    }

    return {
      data: ((data ?? []) as { id: string; full_name: string }[]).map((d) => ({
        id: d.id,
        name: d.full_name,
      })),
      error: null,
    };
  } catch (err) {
    console.error("[getDentistList] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
