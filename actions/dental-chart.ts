"use server";

import { revalidatePath } from "next/cache";
import { resolveSession as resolveCachedSession } from "@/lib/auth/session";
import { upsertToothRow } from "@/lib/dental-chart/sync";
import { FDI_TOOTH_NUMBERS, getToothIdentity } from "@/lib/dental-chart/teeth";
import {
  UpsertToothSchema,
  BulkUpdateTeethSchema,
  type ActionResult,
  type PatientTooth,
  type ToothHistory,
  type ToothChartEntry,
  type ToothLinkedTreatment,
  type PatientDentalChart,
  type DentitionType,
} from "@/types";

/**
 * Dental Chart Server Actions
 *
 * Security rules (enforced in every action):
 * - clinic_id is ALWAYS sourced from the server session, never the client.
 * - Only the `dentist` role may read or write the chart — matches
 *   CLAUDE.md §3 (receptionists have no access to clinical treatment detail)
 *   and the RLS policies in 20260814000000_dental_chart.sql, which define no
 *   receptionist policy at all.
 * - patient_id is always validated against clinic_id before any read/write.
 * - Soft-deleted patient_teeth rows are excluded (`deleted_at IS NULL`).
 * - Every write appends a tooth_history row (see lib/dental-chart/sync.ts) —
 *   the chart's current state is never overwritten without a trace.
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
  const { db, profile } = await resolveCachedSession();
  return { db, profile };
}

async function assertPatientInClinic(
  db: DbClient,
  patientId: string,
  clinicId: string
): Promise<boolean> {
  const { data } = await db
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle();
  return Boolean(data);
}

// =============================================================================
// getPatientDentalChart — dentist only. Full chart for one dentition.
// =============================================================================

export async function getPatientDentalChart(
  patientId: string,
  dentitionType: DentitionType = "adult"
): Promise<ActionResult<PatientDentalChart>> {
  try {
    if (!patientId) return { data: null, error: "Patient ID is required." };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can view the dental chart." };
    }

    if (!(await assertPatientInClinic(db, patientId, profile.clinic_id))) {
      return { data: null, error: "Patient not found in this clinic." };
    }

    const [teethResult, treatmentsResult] = await Promise.all([
      db
        .from("patient_teeth")
        .select("*")
        .eq("patient_id", patientId)
        .eq("dentition_type", dentitionType)
        .is("deleted_at", null),
      db
        .from("treatments")
        .select(
          "id, treatment_type, status, cost, performed_at, created_at, patient_visible_notes, appointment_id, tooth_number, dentition_type"
        )
        .eq("patient_id", patientId)
        .eq("dentition_type", dentitionType)
        .eq("clinic_id", profile.clinic_id)
        .not("tooth_number", "is", null)
        .is("deleted_at", null)
        .order("performed_at", { ascending: false, nullsFirst: false }),
    ]);

    if (teethResult.error) {
      console.error("[getPatientDentalChart] teeth query failed", teethResult.error);
      return { data: null, error: "Failed to load dental chart." };
    }
    if (treatmentsResult.error) {
      console.error("[getPatientDentalChart] treatments query failed", treatmentsResult.error);
      return { data: null, error: "Failed to load dental chart." };
    }

    const teethRows = (teethResult.data ?? []) as PatientTooth[];
    const treatmentRows = (treatmentsResult.data ?? []) as (ToothLinkedTreatment & {
      tooth_number: number | null;
    })[];

    const toothIds = teethRows.map((t) => t.id);
    let historyRows: ToothHistory[] = [];
    if (toothIds.length > 0) {
      const { data: history, error: historyError } = await db
        .from("tooth_history")
        .select("*")
        .in("patient_tooth_id", toothIds)
        .order("timestamp", { ascending: false });
      if (historyError) {
        console.error("[getPatientDentalChart] history query failed", historyError);
      } else {
        historyRows = (history ?? []) as ToothHistory[];
      }
    }

    const teethByNumber = new Map(teethRows.map((t) => [t.tooth_number, t]));
    const historyByToothId = new Map<string, ToothHistory[]>();
    for (const h of historyRows) {
      const list = historyByToothId.get(h.patient_tooth_id) ?? [];
      list.push(h);
      historyByToothId.set(h.patient_tooth_id, list);
    }
    const treatmentsByToothNumber = new Map<number, ToothLinkedTreatment[]>();
    for (const t of treatmentRows) {
      if (t.tooth_number == null) continue;
      const list = treatmentsByToothNumber.get(t.tooth_number) ?? [];
      list.push(t);
      treatmentsByToothNumber.set(t.tooth_number, list);
    }

    const allNumbers = FDI_TOOTH_NUMBERS[dentitionType] as readonly number[];
    const teeth: ToothChartEntry[] = allNumbers.map((toothNumber) => {
      // Validates the number is well-formed for this dentition; throws only
      // on a corrupt constant, never on user input (allNumbers is our own list).
      getToothIdentity(dentitionType, toothNumber);
      const tooth = teethByNumber.get(toothNumber) ?? null;
      return {
        toothNumber,
        dentitionType,
        tooth,
        history: tooth ? (historyByToothId.get(tooth.id) ?? []) : [],
        treatments: treatmentsByToothNumber.get(toothNumber) ?? [],
      };
    });

    return {
      data: { patientId, dentitionType, teeth },
      error: null,
    };
  } catch (err) {
    console.error("[getPatientDentalChart] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// upsertToothState — dentist only. Single-tooth edit from the detail panel.
// =============================================================================

export async function upsertToothState(input: unknown): Promise<ActionResult<PatientTooth>> {
  try {
    const parsed = UpsertToothSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can edit the dental chart." };
    }

    if (!(await assertPatientInClinic(db, parsed.data.patient_id, profile.clinic_id))) {
      return { data: null, error: "Patient not found in this clinic." };
    }

    const result = await upsertToothRow(db, {
      clinicId: profile.clinic_id,
      patientId: parsed.data.patient_id,
      dentitionType: parsed.data.dentition_type,
      toothNumber: parsed.data.tooth_number,
      status: parsed.data.status,
      condition: parsed.data.condition ?? null,
      notes: parsed.data.notes ?? null,
      performedBy: profile.id,
    });

    if (!result.ok) return { data: null, error: result.error };

    revalidatePath(`/dentist/patients/${parsed.data.patient_id}`);

    return { data: result.data, error: null };
  } catch (err) {
    console.error("[upsertToothState] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// bulkUpdateTeeth — dentist only. Multi-select "Add Treatment to Selected".
// =============================================================================

export async function bulkUpdateTeeth(input: unknown): Promise<ActionResult<PatientTooth[]>> {
  try {
    const parsed = BulkUpdateTeethSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can edit the dental chart." };
    }

    if (!(await assertPatientInClinic(db, parsed.data.patient_id, profile.clinic_id))) {
      return { data: null, error: "Patient not found in this clinic." };
    }

    const results: PatientTooth[] = [];
    // Sequential rather than Promise.all: each write appends a history row and
    // we want a deterministic, one-at-a-time audit trail rather than
    // interleaved concurrent writes to the same patient's chart.
    for (const toothNumber of parsed.data.tooth_numbers) {
      const result = await upsertToothRow(db, {
        clinicId: profile.clinic_id,
        patientId: parsed.data.patient_id,
        dentitionType: parsed.data.dentition_type,
        toothNumber,
        status: parsed.data.status,
        condition: parsed.data.condition ?? null,
        notes: parsed.data.notes ?? null,
        performedBy: profile.id,
      });
      if (!result.ok) {
        return {
          data: results.length > 0 ? results : null,
          error: `Saved ${results.length} of ${parsed.data.tooth_numbers.length} teeth — ${result.error}`,
        };
      }
      results.push(result.data);
    }

    revalidatePath(`/dentist/patients/${parsed.data.patient_id}`);

    return { data: results, error: null };
  } catch (err) {
    console.error("[bulkUpdateTeeth] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getToothHistory — dentist only. Full history for one tooth.
// =============================================================================

export async function getToothHistory(patientToothId: string): Promise<ActionResult<ToothHistory[]>> {
  try {
    if (!patientToothId) return { data: [], error: null };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden" };
    }

    // Ownership check: the tooth must belong to a patient in the caller's clinic.
    const { data: toothRow } = await db
      .from("patient_teeth")
      .select("id, clinic_id")
      .eq("id", patientToothId)
      .eq("clinic_id", profile.clinic_id)
      .maybeSingle();

    if (!toothRow) return { data: null, error: "Tooth not found in this clinic." };

    const { data, error } = await db
      .from("tooth_history")
      .select("*")
      .eq("patient_tooth_id", patientToothId)
      .order("timestamp", { ascending: false });

    if (error) {
      console.error("[getToothHistory]", error);
      return { data: null, error: "Failed to load tooth history." };
    }

    return { data: (data ?? []) as ToothHistory[], error: null };
  } catch (err) {
    console.error("[getToothHistory] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
