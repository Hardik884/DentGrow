/**
 * lib/consents/flag.ts
 *
 * Patient Consent Forms is being piloted with one clinic before a wider
 * rollout (see migration 20260816010000_consent_forms_clinic_flag.sql).
 * `clinic_settings.consent_forms_enabled` is the single source of truth,
 * default false for every clinic. This helper is the one place that reads it,
 * so every call site — server actions and page components alike — agrees on
 * what "enabled" means.
 *
 * This is an application-level rollout gate, not a security boundary: RLS
 * already fully isolates clinic data regardless of this flag. Callers should
 * still treat "disabled" as "this feature does not exist for this clinic" —
 * hide UI entry points and reject mutations with a clear message.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export const CONSENT_FORMS_DISABLED_MESSAGE =
  "Patient Consent Forms is not enabled for your clinic yet.";

/** Read the flag for a specific clinic. Used by server actions, which already
 *  have a resolved `db` client + `clinic_id` from the session. */
export async function isConsentFormsEnabled(db: DbClient, clinicId: string): Promise<boolean> {
  const { data } = await db
    .from("clinic_settings")
    .select("consent_forms_enabled")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  return (data?.consent_forms_enabled as boolean | null | undefined) ?? false;
}
