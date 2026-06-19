"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import {
  LinkPortalAccountSchema,
  type ActionResult,
  type PortalLinkStatus,
  type PortalUser,
  type Patient,
} from "@/types";

/**
 * Portal Link Server Actions
 *
 * Manages the optional link between a Supabase Auth account and a patient record.
 * See CLAUDE.md §5.8 for the full portal linking architecture.
 *
 * Key rules:
 * - Patient records exist independently of auth accounts.
 * - Linking is done by phone number match — the auth user provides their phone,
 *   the system finds the matching active patient record in the clinic.
 * - UNIQUE constraints on patient_portal_links prevent duplicate links.
 * - clinic_id is derived from patients.clinic_id via join — never stored in portal links.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

// =============================================================================
// linkPortalAccount — called post-signup on /portal/setup
// =============================================================================

export async function linkPortalAccount(
  input: unknown
): Promise<ActionResult<null>> {
  try {
    const parsed = LinkPortalAccountSchema.safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message ?? "Invalid phone number",
      };
    }

    const supabase = await createServerClient();
    const db: DbClient = supabase;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Unauthorized" };

    // Check if this user already has a portal link (UNIQUE constraint guard)
    const { data: existingLink } = await db
      .from("patient_portal_links")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingLink) {
      // Already linked — redirect to portal
      redirect("/portal");
    }

    // Search active patients by phone (case-insensitive, trimmed)
    const phone = parsed.data.phone.trim();

    const { data: matches, error: searchErr } = await db
      .from("patients")
      .select("id, name, clinic_id, phone")
      .ilike("phone", phone)
      .is("deleted_at", null)
      .limit(5);

    if (searchErr) {
      console.error("[linkPortalAccount] search:", searchErr);
      return { data: null, error: "Unable to search for your record. Please try again." };
    }

    const patients = (matches ?? []) as Pick<Patient, "id" | "name" | "clinic_id" | "phone">[];

    if (patients.length === 0) {
      return {
        data: null,
        error:
          "No patient record found with that phone number. Please contact your clinic to link your account.",
      };
    }

    // Guard: if multiple matches somehow slip through (phone not unique in schema),
    // use the first match. The clinic should maintain unique phone numbers.
    const patient = patients[0];

    // Check the patient isn't already linked to another auth account
    const { data: patientLinkExists } = await db
      .from("patient_portal_links")
      .select("id")
      .eq("patient_id", patient.id)
      .maybeSingle();

    if (patientLinkExists) {
      return {
        data: null,
        error:
          "This patient record is already linked to another account. Please contact your clinic.",
      };
    }

    // Create the portal link
    const { error: insertErr } = await db.from("patient_portal_links").insert({
      patient_id: patient.id,
      user_id: user.id,
    });

    if (insertErr) {
      console.error("[linkPortalAccount] insert:", insertErr);
      return { data: null, error: "Failed to link account. Please try again." };
    }

    revalidatePath("/portal");
    return { data: null, error: null };
  } catch (err) {
    // next/navigation redirect throws — rethrow so Next.js handles it
    if (
      err instanceof Error &&
      err.message === "NEXT_REDIRECT"
    ) {
      throw err;
    }
    console.error("[linkPortalAccount] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getLinkedPatient — resolves authenticated portal user's patient_id + clinic_id
// =============================================================================

export async function getLinkedPatient(): Promise<ActionResult<PortalUser>> {
  try {
    const supabase = await createServerClient();
    const db: DbClient = supabase;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Unauthorized" };

    const { data, error } = await db
      .from("patient_portal_links")
      .select("patient_id, patients!inner(clinic_id)")
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return { data: null, error: "Portal account not linked." };
    }

    const row = data as {
      patient_id: string;
      patients: { clinic_id: string };
    };

    return {
      data: {
        id: user.id,
        patientId: row.patient_id,
        clinicId: row.patients.clinic_id,
      },
      error: null,
    };
  } catch (err) {
    console.error("[getLinkedPatient] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// checkPortalLinkStatus — for /portal/setup page state
// =============================================================================

export async function checkPortalLinkStatus(): Promise<
  ActionResult<PortalLinkStatus>
> {
  try {
    const supabase = await createServerClient();
    const db: DbClient = supabase;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: "unlinked", error: null };

    const { data } = await db
      .from("patient_portal_links")
      .select("patient_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      return { data: "linked", error: null };
    }

    return { data: "unlinked", error: null };
  } catch (err) {
    console.error("[checkPortalLinkStatus] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getPortalProfile — get the authenticated patient's own profile
// Only patient-visible, non-clinical fields returned.
// =============================================================================

export type PortalPatientProfile = {
  id: string;
  name: string;
  phone: string | null;
  date_of_birth: string | null;
  gender: "male" | "female" | "other" | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  total_visits: number;
  last_visit: string | null;
  created_at: string;
};

export async function getPortalProfile(): Promise<
  ActionResult<PortalPatientProfile>
> {
  try {
    const supabase = await createServerClient();
    const db: DbClient = supabase;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Unauthorized" };

    // Resolve patient via portal link
    const { data: link } = await db
      .from("patient_portal_links")
      .select("patient_id")
      .eq("user_id", user.id)
      .single();

    if (!link?.patient_id) {
      return { data: null, error: "Portal account not linked." };
    }

    const { data, error } = await db
      .from("patients")
      .select(
        "id, name, phone, date_of_birth, gender, address, emergency_contact_name, emergency_contact_phone, total_visits, last_visit, created_at"
      )
      .eq("id", link.patient_id)
      .is("deleted_at", null)
      .single();

    if (error || !data) {
      return { data: null, error: "Patient record not found." };
    }

    return { data: data as PortalPatientProfile, error: null };
  } catch (err) {
    console.error("[getPortalProfile] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// updatePortalProfile — patient can update allowed demographic fields only.
// Clinical fields (notes) and system fields (total_visits, last_visit) are
// never exposed or updatable from this action.
// =============================================================================

export const PORTAL_UPDATABLE_FIELDS = [
  "phone",
  "address",
  "emergency_contact_name",
  "emergency_contact_phone",
] as const;

import { z } from "zod";

const phoneRegex = /^[+]?[\d\s\-().]{7,15}$/;

export const UpdatePortalProfileSchema = z.object({
  phone: z
    .string()
    .regex(phoneRegex, "Invalid phone number format")
    .optional()
    .or(z.literal("")),
  address: z.string().max(500).optional(),
  emergency_contact_name: z.string().max(100).optional(),
  emergency_contact_phone: z
    .string()
    .regex(phoneRegex, "Invalid emergency contact phone")
    .optional()
    .or(z.literal("")),
});
export type UpdatePortalProfileInput = z.infer<typeof UpdatePortalProfileSchema>;

export async function updatePortalProfile(
  input: unknown
): Promise<ActionResult<PortalPatientProfile>> {
  try {
    const parsed = UpdatePortalProfileSchema.safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message ?? "Invalid input",
      };
    }

    const supabase = await createServerClient();
    const db: DbClient = supabase;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Unauthorized" };

    // Resolve patient via portal link
    const { data: link } = await db
      .from("patient_portal_links")
      .select("patient_id")
      .eq("user_id", user.id)
      .single();

    if (!link?.patient_id) {
      return { data: null, error: "Portal account not linked." };
    }

    // Only update the fields that are safe for patients to edit
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.phone !== undefined)
      updates.phone = parsed.data.phone || null;
    if (parsed.data.address !== undefined)
      updates.address = parsed.data.address || null;
    if (parsed.data.emergency_contact_name !== undefined)
      updates.emergency_contact_name =
        parsed.data.emergency_contact_name || null;
    if (parsed.data.emergency_contact_phone !== undefined)
      updates.emergency_contact_phone =
        parsed.data.emergency_contact_phone || null;

    const { data, error } = await db
      .from("patients")
      .update(updates)
      .eq("id", link.patient_id)
      .is("deleted_at", null)
      .select(
        "id, name, phone, date_of_birth, gender, address, emergency_contact_name, emergency_contact_phone, total_visits, last_visit, created_at"
      )
      .single();

    if (error || !data) {
      console.error("[updatePortalProfile]", error);
      return { data: null, error: "Failed to update profile." };
    }

    revalidatePath("/portal/profile");

    return { data: data as PortalPatientProfile, error: null };
  } catch (err) {
    console.error("[updatePortalProfile] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
