/**
 * lib/dental-chart/sync.ts
 *
 * Shared patient_teeth upsert + history-write logic, used by BOTH:
 *   - actions/dental-chart.ts  → upsertToothState / bulkUpdateTeeth (direct
 *     chart edits made from the Dental Chart UI; failures are fatal and
 *     surfaced to the dentist).
 *   - actions/treatments.ts    → createTreatment / updateTreatment, when the
 *     dentist links a treatment to a tooth (an auxiliary sync; failures are
 *     logged but never block saving the treatment — the same non-fatal
 *     posture as lib/follow-ups/complete-linked.ts and
 *     lib/appointments/history.ts).
 *
 * Kept as a lib helper rather than duplicated in both action files, per
 * CLAUDE.md §13.8 ("if a pattern is used in more than two places, extract it
 * into a shared utility").
 */

import { writeToothHistory, type ToothHistoryAction } from "@/lib/dental-chart/history";
import { isValidToothNumber } from "@/lib/dental-chart/teeth";
import type { DentitionType, PatientTooth, ToothStatus } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export type UpsertToothRowParams = {
  clinicId: string;
  patientId: string;
  dentitionType: DentitionType;
  toothNumber: number;
  status: ToothStatus;
  condition?: string | null;
  notes?: string | null;
  performedBy: string | null;
  /** Set when this write originated from linking/saving a treatment. */
  treatmentId?: string | null;
  /**
   * When true, `condition`/`notes` are left exactly as they are on an
   * existing row (only `status` and the treatment link are touched) — used
   * by the treatment-linking sync, which only ever knows about status, not
   * the dentist's chart notes. Defaults to false: the Dental Chart's own
   * edit form always submits the tooth's complete current state, so a
   * direct chart edit is a full overwrite (including intentionally clearing
   * condition/notes to empty).
   */
  preserveExistingConditionAndNotes?: boolean;
};

export type UpsertToothRowResult =
  | { ok: true; data: PatientTooth }
  | { ok: false; error: string };

/**
 * Insert or update a single patient_teeth row (keyed on
 * patient_id + dentition_type + tooth_number) and append a tooth_history
 * event describing what changed. Runs under the caller's RLS-scoped `db`
 * client — the dentist write policies on patient_teeth allow this directly;
 * only the tooth_history insert (no client write policy) goes through the
 * service-role client inside writeToothHistory.
 */
export async function upsertToothRow(
  db: DbClient,
  params: UpsertToothRowParams
): Promise<UpsertToothRowResult> {
  if (!isValidToothNumber(params.dentitionType, params.toothNumber)) {
    return { ok: false, error: `Tooth ${params.toothNumber} is not valid for ${params.dentitionType} dentition.` };
  }

  const { data: existing } = await db
    .from("patient_teeth")
    .select("*")
    .eq("patient_id", params.patientId)
    .eq("dentition_type", params.dentitionType)
    .eq("tooth_number", params.toothNumber)
    .is("deleted_at", null)
    .maybeSingle();

  const existingRow = existing as PatientTooth | null;
  const nextValue = params.preserveExistingConditionAndNotes
    ? {
        status: params.status,
        condition: existingRow?.condition ?? params.condition ?? null,
        notes: existingRow?.notes ?? params.notes ?? null,
      }
    : {
        status: params.status,
        condition: params.condition ?? null,
        notes: params.notes ?? null,
      };

  let row: PatientTooth | null = null;
  let historyAction: ToothHistoryAction;
  let oldValue: Record<string, unknown> | null = null;

  if (existingRow) {
    oldValue = {
      status: existingRow.status,
      condition: existingRow.condition,
      notes: existingRow.notes,
    };

    const { data, error } = await db
      .from("patient_teeth")
      .update({
        status: nextValue.status,
        condition: nextValue.condition,
        notes: nextValue.notes,
        updated_by: params.performedBy,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingRow.id)
      .select()
      .single();

    if (error) {
      console.error("[upsertToothRow] update failed", error);
      return { ok: false, error: "Failed to update tooth." };
    }
    row = data as PatientTooth;
    historyAction = params.treatmentId
      ? "treatment_linked"
      : oldValue.status !== nextValue.status
        ? "status_changed"
        : oldValue.condition !== nextValue.condition
          ? "condition_updated"
          : "note_added";
  } else {
    const { data, error } = await db
      .from("patient_teeth")
      .insert({
        clinic_id: params.clinicId,
        patient_id: params.patientId,
        dentition_type: params.dentitionType,
        tooth_number: params.toothNumber,
        status: nextValue.status,
        condition: nextValue.condition,
        notes: nextValue.notes,
        updated_by: params.performedBy,
      })
      .select()
      .single();

    if (error) {
      console.error("[upsertToothRow] insert failed", error);
      return { ok: false, error: "Failed to create tooth chart entry." };
    }
    row = data as PatientTooth;
    historyAction = params.treatmentId ? "treatment_linked" : "status_changed";
  }

  // Non-fatal: the tooth row is already saved. A history-write failure is
  // logged (inside writeToothHistory) but never rolls back the chart update.
  await writeToothHistory({
    patientToothId: row.id,
    action: historyAction,
    oldValue,
    newValue: nextValue,
    performedBy: params.performedBy,
    treatmentId: params.treatmentId ?? null,
  });

  return { ok: true, data: row };
}

/**
 * Maps a treatment's lifecycle status to the tooth status it implies.
 * `cancelled` deliberately returns null — a cancelled treatment shouldn't
 * silently change what the chart says is happening to the tooth.
 */
export function toothStatusForTreatmentStatus(
  treatmentStatus: "planned" | "in_progress" | "completed" | "cancelled"
): ToothStatus | null {
  switch (treatmentStatus) {
    case "planned":
      return "planned";
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "cancelled":
      return null;
  }
}

/**
 * Shared "keep a linked tooth's chart status in step with its treatment"
 * sync, used by:
 *   - actions/treatments.ts   → createTreatment / updateTreatment, whenever
 *     the treatment being saved carries a tooth link (auxiliary side effect
 *     of saving a treatment; failures are logged but never block the save).
 *   - actions/dental-chart.ts → linkTreatmentToTooth, when the dentist
 *     retroactively links an existing (past or current) treatment to a
 *     tooth from the chart itself.
 *
 * `cancelled` treatments are a deliberate no-op — see
 * toothStatusForTreatmentStatus above.
 */
export async function syncToothForTreatment(
  db: DbClient,
  params: {
    clinicId: string;
    performedBy: string;
    treatmentId: string;
    patientId: string;
    toothNumber: number | null | undefined;
    dentitionType: DentitionType | null | undefined;
    treatmentStatus: "planned" | "in_progress" | "completed" | "cancelled";
  }
): Promise<void> {
  if (params.toothNumber == null || !params.dentitionType) return;

  const status = toothStatusForTreatmentStatus(params.treatmentStatus);
  if (!status) return; // cancelled — leave the chart's own status untouched

  try {
    const result = await upsertToothRow(db, {
      clinicId: params.clinicId,
      patientId: params.patientId,
      dentitionType: params.dentitionType,
      toothNumber: params.toothNumber,
      status,
      performedBy: params.performedBy,
      treatmentId: params.treatmentId,
      preserveExistingConditionAndNotes: true,
    });
    if (!result.ok) {
      console.error("[syncToothForTreatment]", result.error);
    }
  } catch (err) {
    console.error("[syncToothForTreatment] unexpected:", err);
  }
}
