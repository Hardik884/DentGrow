"use server";

import { resolveSession as resolveCachedSession } from "@/lib/auth/session";
import { getUtcBoundariesForLocalDate } from "@/lib/utils";
import { recordPhiAccess } from "@/lib/audit/phi-access";
import { DEFAULT_TIMEZONE } from "@/lib/clinic/constants";
import { getPatientTreatments } from "@/actions/treatments";
import type { ActionResult, TreatmentForPatientWithSignature } from "@/types";

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

    // Resolve the dentist filter to appointment IDs FIRST, so it becomes a
    // DATABASE filter applied before pagination — not a filter on an
    // already-sliced page, which returned wrong counts and hid matching records
    // on later pages (audit A10). Dentist identity lives on the appointment, not
    // the treatment, so we look up the dentist's appointments up front.
    let appointmentIdFilter: string[] | null = null;
    if (filters?.dentistId) {
      const { data: apptRows, error: apptErr } = await db
        .from("appointments")
        .select("id")
        .eq("clinic_id", profile.clinic_id)
        .eq("dentist_id", filters.dentistId);
      if (apptErr) {
        console.error("[getPrescriptions] dentist appointments:", apptErr);
        return { data: null, error: "Failed to fetch prescriptions." };
      }
      appointmentIdFilter = ((apptRows ?? []) as { id: string }[]).map((a) => a.id);
      if (appointmentIdFilter.length === 0) {
        return { data: { prescriptions: [], total: 0 }, error: null };
      }
    }

    // Resolve the clinic timezone so the date filter bounds a clinic-local day.
    // `performed_at` is a timestamptz; a naive `${date}T00:00:00` string is read
    // as UTC and shifts the window for a non-UTC clinic (audit A17).
    let timezone = DEFAULT_TIMEZONE;
    if (filters?.dateFrom || filters?.dateTo) {
      const { data: tzSettings } = await db
        .from("clinic_settings")
        .select("timezone")
        .eq("clinic_id", profile.clinic_id)
        .maybeSingle();
      timezone = (tzSettings as { timezone?: string } | null)?.timezone ?? DEFAULT_TIMEZONE;
    }

    type PrescriptionTreatmentRow = {
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
    };

    // A "prescription" is a completed treatment whose `medications` array is
    // non-empty — a JSONB test that runs in memory — and the medicine-name search
    // is in-memory too. Because the final filter can't be expressed as one SQL
    // WHERE, we read every matching row in DB-side chunks (defeating PostgREST's
    // ~1000-row default cap that silently truncated large clinics — audit A11),
    // then filter and paginate the COMPLETE set so the count and list are exact.
    const buildQuery = () => {
      let q = db
        .from("treatments")
        .select(
          "id, patient_id, treatment_type, performed_at, created_at, patient_visible_notes, medications, appointment_id"
        )
        .eq("clinic_id", profile.clinic_id)
        .eq("status", "completed")
        .is("deleted_at", null);

      if (filters?.treatmentType && filters.treatmentType.trim().length >= 1) {
        q = q.ilike("treatment_type", `%${filters.treatmentType.trim()}%`);
      }
      if (patientIdFilter !== null) {
        q = q.in("patient_id", patientIdFilter);
      }
      if (appointmentIdFilter !== null) {
        q = q.in("appointment_id", appointmentIdFilter);
      }
      if (filters?.dateFrom)
        q = q.gte("performed_at", getUtcBoundariesForLocalDate(filters.dateFrom, timezone).start);
      if (filters?.dateTo)
        q = q.lte("performed_at", getUtcBoundariesForLocalDate(filters.dateTo, timezone).end);

      return q
        .order("performed_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    };

    const CHUNK = 1000;
    let allRows: PrescriptionTreatmentRow[] = [];
    for (let start = 0; ; start += CHUNK) {
      const { data: batchData, error: batchErr } = await buildQuery().range(
        start,
        start + CHUNK - 1
      );
      if (batchErr) {
        console.error("[getPrescriptions] treatments:", batchErr);
        return { data: null, error: "Failed to fetch prescriptions." };
      }
      const batch = (batchData ?? []) as PrescriptionTreatmentRow[];
      allRows = allRows.concat(batch);
      if (batch.length < CHUNK) break;
    }

    // In-memory filters SQL can't express: non-empty medications, then the
    // medicine-name content search.
    let treatments = allRows.filter(
      (t) => Array.isArray(t.medications) && t.medications.length > 0
    );
    if (filters?.medicineName && filters.medicineName.trim().length >= 1) {
      const medSearch = filters.medicineName.trim().toLowerCase();
      treatments = treatments.filter((t) =>
        t.medications?.some((m) => m.name.toLowerCase().includes(medSearch))
      );
    }

    // Exact total over the FULLY-filtered set (dentist filter already applied in
    // the DB above), then paginate.
    const totalAfterFilters = treatments.length;
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

    // The dentist filter has already been applied at the database level (audit
    // A10), so the paginated rows are the final set.

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
    const prescriptions: PrescriptionRecord[] = paginatedTreatments
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

    // The prescriptions worklist resolves patient names, phone numbers and
    // dispensed medications together, so a page of it is a real clinical read
    // even though it is a list rather than one record. Recorded ONCE per page,
    // with a count and no identifiers of the patients it contained — a row per
    // prescription would drown the log every time a receptionist paged.
    if (prescriptions.length > 0) {
      await recordPhiAccess(profile, {
        event: "PRESCRIPTION_VIEWED",
        resourceType: "treatment",
        context: {
          surface: "prescriptions-worklist",
          count: prescriptions.length,
        },
      });
    }

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

// =============================================================================
// getPatientPrescriptions — patient portal, read-only (audit B9)
// =============================================================================

/**
 * A patient's own prescriptions — treatments with a non-empty `medications`
 * array — for the patient portal.
 *
 * Deliberately delegates to `getPatientTreatments` rather than querying
 * `treatments` directly: that function already resolves the authenticated
 * patient via `patient_portal_links.user_id = auth.uid()` (never from client
 * input), selects only patient-safe columns (no `internal_notes`, no cost
 * splits), and enriches with the prescribing dentist's signature and
 * registration number — the exact same column-safety and authorization this
 * function needs, so reusing it means there is no second, independently
 * reviewed query path to keep in sync. This is read-only; nothing here can
 * create, update, or delete a treatment.
 */
export async function getPatientPrescriptions(): Promise<
  ActionResult<TreatmentForPatientWithSignature[]>
> {
  const result = await getPatientTreatments("");
  if (result.error || !result.data) return result;

  return {
    data: result.data.filter(
      (t) => Array.isArray(t.medications) && t.medications.length > 0,
    ),
    error: null,
  };
}
