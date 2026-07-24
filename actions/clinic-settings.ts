"use server";

import { revalidatePath } from "next/cache";
import { resolveSession as resolveCachedSession } from "@/lib/auth/session";
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

// =============================================================================
// getClinicSettings — readable by any authenticated clinic member
// =============================================================================

export async function getClinicSettings(): Promise<ActionResult<ClinicSettings>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };

    const { data, error } = await db
      .from("clinic_settings")
      .select("*")
      .eq("clinic_id", profile.clinic_id)
      .maybeSingle();

    if (error) {
      console.error("[getClinicSettings]", error);
      return { data: null, error: "Failed to fetch clinic settings." };
    }

    // If no settings row exists yet, return null (page will show empty form)
    return { data: (data as ClinicSettings | null) ?? null, error: null };
  } catch (err) {
    console.error("[getClinicSettings] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// checkReceptionistPaymentAccess — verify if receptionist can access payments
// Returns: true if dentist OR receptionist with permission, false otherwise
// =============================================================================

export async function checkReceptionistPaymentAccess(): Promise<boolean> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return false;

    // Dentists always have payment access
    if (profile.role === "dentist") return true;

    // Patients never have staff payment access
    if (profile.role === "patient") return false;

    // Receptionists: check clinic setting
    if (profile.role === "receptionist") {
      const { data } = await db
        .from("clinic_settings")
        .select("allow_receptionist_payments")
        .eq("clinic_id", profile.clinic_id)
        .maybeSingle();

      return (data as { allow_receptionist_payments?: boolean } | null)?.allow_receptionist_payments ?? false;
    }

    return false;
  } catch (err) {
    console.error("[checkReceptionistPaymentAccess] unexpected:", err);
    return false;
  }
}

// =============================================================================
// updateClinicSettings — dentist only
// Upserts the clinic_settings row (creates it if it doesn't exist yet).
// =============================================================================

export async function updateClinicSettings(
  input: unknown
): Promise<ActionResult<ClinicSettings>> {
  try {
    const parsed = UpdateClinicSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message ?? "Invalid input",
      };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can update clinic settings." };
    }

    // Upsert: update if exists, insert if not (first time a dentist saves settings)
    const { data, error } = await db
      .from("clinic_settings")
      .upsert(
        {
          clinic_id: profile.clinic_id,
          clinic_name: parsed.data.clinic_name,
          phone: parsed.data.phone || null,
          email: parsed.data.email || null,
          address: parsed.data.address || null,
          average_appointment_duration: parsed.data.average_appointment_duration,
          timezone: parsed.data.timezone,
          registration_number: parsed.data.registration_number || null,
          allow_receptionist_payments: parsed.data.allow_receptionist_payments ?? false,
          show_consultancy_on_dashboard: parsed.data.show_consultancy_on_dashboard ?? true,
          default_opd_fee: parsed.data.default_opd_fee ?? null,
          enable_xray_charges: parsed.data.enable_xray_charges ?? true,
          clinic_hours: parsed.data.clinic_hours ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "clinic_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("[updateClinicSettings]", error);
      return { data: null, error: "Failed to save clinic settings." };
    }

    revalidatePath("/dentist/settings");
    return { data: data as ClinicSettings, error: null };
  } catch (err) {
    console.error("[updateClinicSettings] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
