/**
 * lib/appointments/patient-safe-columns.ts
 *
 * The single definition of which `appointments` columns may be returned to a
 * PATIENT, and which must never be (audit A1/A2).
 *
 * Everything clinical or staff-internal is deliberately excluded so a portal
 * query can never leak it. The portal only ever needs a visit's time, length,
 * status and source; the clinical fields (`notes`, `chief_complaints`,
 * `medical_history`, `oral_findings`, `provisional_diagnosis`) and back-office
 * fields (`created_by`) are for staff only. Adding a column to the safe list is
 * a conscious decision to show it to patients — `patient-safe-columns.spec.ts`
 * asserts the clinical set is never present in it.
 *
 * These live here rather than in `actions/appointments.ts` because that file is
 * a `"use server"` module, which may only export async functions.
 */

/** Columns on `appointments` that are safe to return to a patient. */
export const PATIENT_SAFE_APPOINTMENT_COLUMNS = [
  "id",
  "clinic_id",
  "patient_id",
  "dentist_id",
  "scheduled_at",
  "duration_minutes",
  "status",
  "source",
  "created_at",
  "updated_at",
] as const;

/** Appointment columns that must NEVER be returned to a patient. */
export const CLINICAL_APPOINTMENT_COLUMNS = [
  "notes",
  "chief_complaints",
  "medical_history",
  "oral_findings",
  "provisional_diagnosis",
  "created_by",
] as const;

/**
 * PostgREST `select` string for the patient branch of `getAppointment`: the
 * safe columns plus the patient join the portal needs.
 */
export const PATIENT_APPOINTMENT_SELECT = `${PATIENT_SAFE_APPOINTMENT_COLUMNS.join(
  ", ",
)}, patient:patients(id, name, phone, date_of_birth, gender)`;
