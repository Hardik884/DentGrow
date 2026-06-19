"use server";

import {
  UpdateClinicSettingsSchema,
  type ActionResult,
  type ClinicSettings,
} from "@/types";

/**
 * Clinic Settings Server Actions
 *
 * Key rules:
 * - getClinicSettings: readable by any authenticated clinic member.
 * - updateClinicSettings: dentist only.
 * - clinic_id always from session — never from client.
 * - Used as the source of truth for AI prompts, queue wait-time estimation,
 *   and appointment slot boundaries. Never hardcode clinic info in app code.
 */

// =============================================================================
// getClinicSettings
// =============================================================================

export async function getClinicSettings(): Promise<
  ActionResult<ClinicSettings>
> {
  try {
    // TODO: SELECT * FROM clinic_settings WHERE clinic_id = auth_clinic_id()
    return { data: null, error: "Not yet implemented" };
  } catch {
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// updateClinicSettings — dentist only
// =============================================================================

export async function updateClinicSettings(
  input: unknown
): Promise<ActionResult<ClinicSettings>> {
  try {
    const parsed = UpdateClinicSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    // TODO: verify dentist role
    // TODO: update clinic_settings WHERE clinic_id = auth_clinic_id()
    void parsed;
    return { data: null, error: "Not yet implemented" };
  } catch {
    return { data: null, error: "Unexpected error" };
  }
}
