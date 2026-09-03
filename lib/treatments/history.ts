import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * lib/treatments/history.ts
 *
 * Writes to treatment_history.
 *
 * SHAPED AFTER lib/consents/history.ts AND appointment_history
 *   Same pattern, deliberately: the audit row is written by the Server Action
 *   that made the change, through the service role, because the table has no
 *   client write policy. A history that a client could write is a history a
 *   client could forge.
 *
 * WHAT GOES IN old_value / new_value
 *   Only the fields that actually changed. `diffFields` below computes that,
 *   and it is the reason this module exists rather than the call sites building
 *   the payload themselves: an action that passes its whole `updates` object
 *   would record fields that were merely re-sent with the same value, and one
 *   that passes the whole row would turn this table into a second, less
 *   protected copy of the clinical record.
 *
 * NEVER THROWS
 *   The clinical write has already succeeded by the time this is called.
 *   Failing the action at that point would show the dentist an error for a
 *   change that did happen, which is worse than a missing audit row — so the
 *   failure is logged loudly instead, for monitoring to pick up.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HistoryClient = any;

export type TreatmentHistoryAction =
  | "created"
  | "updated"
  | "status_changed"
  | "deleted"
  | "restored";

/**
 * Fields whose changes are worth recording.
 *
 * Everything clinically or financially meaningful, and nothing derived:
 * updated_at changes on every write and would make every diff non-empty,
 * and the revenue-split columns are recomputed from cost and consultant, so
 * recording them separately would triple the size of a diff that already says
 * what happened.
 */
const TRACKED_FIELDS = [
  "treatment_type",
  "internal_notes",
  "patient_visible_notes",
  "medications",
  "cost",
  "status",
  "opd_charged",
  "opd_fee",
  "xray_taken",
  "xray_cost",
  "performed_at",
  "tooth_number",
  "dentition_type",
  "consultant_id",
] as const;

type Row = Record<string, unknown>;

/**
 * The changed subset of two versions of a treatment row.
 *
 * Returns null when nothing tracked changed, so a no-op save does not leave a
 * history row claiming an edit happened.
 */
export function diffFields(
  before: Row | null | undefined,
  after: Row | null | undefined
): { old: Row; new: Row } | null {
  if (!before || !after) return null;

  const oldValue: Row = {};
  const newValue: Row = {};

  for (const field of TRACKED_FIELDS) {
    const a = before[field];
    const b = after[field];
    // JSON comparison so `medications` (an array of objects) compares by value.
    // Both sides come from the same row shape, so key order is stable.
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    oldValue[field] = a ?? null;
    newValue[field] = b ?? null;
  }

  if (Object.keys(newValue).length === 0) return null;
  return { old: oldValue, new: newValue };
}

/**
 * Appends one history row. Silent on failure by design (see the module note).
 */
export async function writeTreatmentHistory(params: {
  clinicId: string;
  treatmentId: string;
  patientId: string;
  action: TreatmentHistoryAction;
  oldValue?: Row | null;
  newValue?: Row | null;
  performedBy: string;
}): Promise<void> {
  try {
    const admin: HistoryClient = createAdminClient();

    const { error } = await admin.from("treatment_history").insert({
      clinic_id: params.clinicId,
      treatment_id: params.treatmentId,
      patient_id: params.patientId,
      action: params.action,
      old_value: params.oldValue ?? null,
      new_value: params.newValue ?? null,
      performed_by: params.performedBy,
    });

    if (error) {
      console.error("[treatment-history] insert failed", {
        treatmentId: params.treatmentId,
        action: params.action,
        code: error.code,
        message: error.message,
      });
    }
  } catch (err) {
    console.error("[treatment-history] unexpected", {
      treatmentId: params.treatmentId,
      action: params.action,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
