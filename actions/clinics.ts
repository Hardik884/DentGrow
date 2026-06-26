"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/types";

/**
 * Clinic directory Server Actions.
 *
 * These power the required Clinic dropdown on the login and patient
 * create-account pages. Because those pages are reached BEFORE the user is
 * authenticated, the clinics list cannot be read through the user-scoped
 * client (the `clinics` RLS policy only exposes a row when
 * id = auth_clinic_id(), which is NULL for an anonymous visitor).
 *
 * We therefore read the public, non-sensitive directory fields (id, name,
 * dentist_name) through the service-role admin client. Only these three
 * columns are returned — no patient or operational data is ever exposed.
 *
 * The list is ordered by created_at so the seed order is preserved
 * (Dr. Liying's Dental Care first, then Clinic B). New clinics added to the
 * table appear automatically with no code change.
 */

export type ClinicOption = {
  id: string;
  name: string;
  dentist_name: string | null;
};

export async function getClinics(): Promise<ActionResult<ClinicOption[]>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = createAdminClient();

    const { data, error } = await admin
      .from("clinics")
      .select("id, name, dentist_name")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[getClinics]", error);
      return { data: null, error: "Unable to load clinics." };
    }

    return { data: (data ?? []) as ClinicOption[], error: null };
  } catch (err) {
    console.error("[getClinics] unexpected:", err);
    return { data: null, error: "Unable to load clinics." };
  }
}

/**
 * getClinicById — validates a clinic id exists and returns its directory row.
 * Used by the signup/link flow to verify a client-supplied clinic selection
 * before it is used to scope a patient lookup or creation.
 */
export async function getClinicById(
  clinicId: string
): Promise<ActionResult<ClinicOption>> {
  try {
    if (!clinicId) return { data: null, error: "Clinic is required." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = createAdminClient();

    const { data, error } = await admin
      .from("clinics")
      .select("id, name, dentist_name")
      .eq("id", clinicId)
      .maybeSingle();

    if (error || !data) {
      return { data: null, error: "Selected clinic was not found." };
    }

    return { data: data as ClinicOption, error: null };
  } catch (err) {
    console.error("[getClinicById] unexpected:", err);
    return { data: null, error: "Unable to verify clinic." };
  }
}
