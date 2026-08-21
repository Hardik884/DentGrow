"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClinicById } from "@/actions/clinics";
import { clearSignupClinic, clearSignupPhone } from "@/lib/clinic-session";
import {
  LinkPortalAccountSchema,
  type ActionResult,
  type PortalLinkStatus,
  type PortalUser,
  type Patient,
} from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

/**
 * normalizePhone
 *
 * Strips all non-digit characters, then removes a leading country code if
 * the result is longer than 10 digits (handles +91, 91, 0 prefixes).
 * Returns the last 10 digits so that all of the following resolve identically:
 *   "9876543210"        → "9876543210"
 *   "+91 9876543210"    → "9876543210"
 *   "91-9876543210"     → "9876543210"
 *   "98765 43210"       → "9876543210"
 *   "+919876543210"     → "9876543210"
 *
 * This normalized form is used for lookups and for storing new self-registered
 * patient records so future lookups always succeed.
 */
function normalizePhone(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "");
  // If we have more than 10 digits, trim to the last 10 (drops country codes)
  return digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
}

/**
 * isNextRedirectError — recognises errors thrown by Next.js redirect()/notFound().
 *
 * Next 15 no longer exports isRedirectError from next/navigation, but the
 * thrown error still carries a `digest` string starting with "NEXT_REDIRECT".
 * We catch and rethrow these so Next.js can perform the redirect.
 */
function isNextRedirectError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    ((err as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
      (err as { digest: string }).digest.startsWith("NEXT_NOT_FOUND"))
  );
}

/**
 * Portal Link Server Actions
 *
 * Manages the link between a Supabase Auth account and a patient record.
 * See CLAUDE.md §5.8 for the full portal linking architecture.
 *
 * Two onboarding paths:
 *
 * A — Existing patient:
 *   Phone matches an active patients row → link user_id to that record. If
 *   more than one active patient in the clinic shares the phone (households,
 *   a parent booking for children — phone numbers are NOT required to be
 *   unique per clinic, see 20260822000000_drop_patient_phone_uniqueness.sql),
 *   the first match is used; a clinic in that position should encourage the
 *   patient to register a number of their own so they land on their own
 *   record next time.
 *   Preserves all existing clinical data.
 *
 * B — New patient (self-registration):
 *   No phone match found. When confirmNew=true a new patients row is created
 *   (name + phone + clinic_id), then linked. The patient can immediately book
 *   appointments. Staff can enrich the record later.
 *
 * Key invariants preserved:
 *   - patient_portal_links.user_id UNIQUE  (one portal account per patient)
 *   - patient_portal_links.patient_id UNIQUE (one account per patient record)
 *   - clinic_id never stored in portal_links — always derived via patients.clinic_id
 *
 * NOT an invariant: patients.phone is not unique, even within a clinic — see
 * 20260822000000_drop_patient_phone_uniqueness.sql for why the earlier
 * uniqueness constraint was actively wrong (it blocked legitimate distinct
 * patients from sharing a household number). Every phone lookup in this file
 * is written to tolerate more than one match.
 */

/**
 * Special sentinel returned when no patient record was found for the given phone
 * and the caller has NOT yet confirmed they want to create a new one.
 * The form uses this to switch to the "new patient" confirmation UI.
 */
export type PortalLinkResult =
  | { status: "linked" }
  | { status: "not_found"; phone: string }   // no existing record — prompt for name
  | { status: "error"; message: string };

// =============================================================================
// linkPortalAccount — called post-signup on /portal/setup
// =============================================================================

export async function linkPortalAccount(
  input: unknown
): Promise<ActionResult<PortalLinkResult>> {
  try {
    const parsed = LinkPortalAccountSchema.safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: parsed.error.errors[0]?.message ?? "Invalid input",
      };
    }

    const supabase = await createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Unauthorized" };

    // Check if this user already has a portal link (UNIQUE constraint guard).
    // Uses the user-scoped client — the portal_links RLS policy allows a linked
    // user to read their own row, so this is safe and correct.
    const { data: existingLink } = await supabase
      .from("patient_portal_links")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingLink) {
      // Already linked — redirect to portal
      redirect("/portal");
    }

    // Guard: staff accounts (dentist/receptionist) must never go through portal
    // linking. The linking flow upserts profiles.role = 'patient', which would
    // overwrite a staff member's profile and demote them — corrupting their
    // access. A staff user who lands here (e.g. by manually visiting
    // /portal/setup) is refused before any write happens.
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (
      existingProfile &&
      (existingProfile as { role: string }).role !== "patient"
    ) {
      return {
        data: null,
        error:
          "This is a staff account and cannot be linked to the patient portal.",
      };
    }

    // Validate the selected clinic. Every subsequent lookup/creation is scoped
    // to this clinic so a phone number registered in another clinic is never
    // matched (clinic isolation requirement).
    const clinicCheck = await getClinicById(parsed.data.clinicId);
    if (!clinicCheck.data) {
      return { data: null, error: clinicCheck.error ?? "Invalid clinic selection." };
    }
    const selectedClinicId = clinicCheck.data.id;

    // Use the admin client for the patient phone lookup.
    //
    // At this point in the flow the user has NO profile row and NO portal link.
    // The patients RLS policies all require either:
    //   • auth_role() = 'dentist'/'receptionist'  (reads from profiles — doesn't exist yet)
    //   • id = auth_patient_id()                  (reads from portal_links — doesn't exist yet)
    //
    // auth_patient_id() returns NULL for an unlinked user, and NULL = id evaluates
    // to NULL (not TRUE) in PostgreSQL, so every patients row is hidden.
    // The user-scoped client therefore always returns zero rows, causing the
    // lookup to fall through to the "not found" branch and create a duplicate.
    //
    // The admin client (service role) bypasses RLS and is the correct pattern
    // here — this is a privileged onboarding lookup, not a patient data read.
    // The lookup is explicitly scoped to selectedClinicId so cross-clinic phone
    // collisions can never match.
    const admin: AdminClient = createAdminClient();

    const phone = normalizePhone(parsed.data.phone.trim());

    // ── PATH A: try to find an existing patient by phone IN THIS CLINIC ───────
    const { data: matches, error: searchErr } = await admin
      .from("patients")
      .select("id, name, clinic_id, phone")
      .eq("clinic_id", selectedClinicId)
      .ilike("phone", `%${phone}`)
      .is("deleted_at", null)
      .limit(5);

    if (searchErr) {
      console.error("[linkPortalAccount] search:", searchErr);
      return { data: null, error: "Unable to search for your record. Please try again." };
    }

    const patients = (matches ?? []) as Pick<Patient, "id" | "name" | "clinic_id" | "phone">[];

    if (patients.length === 0) {
      // ── PATH B: no existing record ───────────────────────────────────────────
      // If the caller hasn't confirmed they want a new record yet, send back the
      // sentinel so the form can ask for their name before proceeding.
      if (!parsed.data.confirmNew) {
        return {
          data: { status: "not_found", phone },
          error: null,
        };
      }

      // Caller confirmed → create a new patient record.
      const name = parsed.data.name?.trim();
      if (!name || name.length < 2) {
        return { data: null, error: "Please enter your full name (at least 2 characters)." };
      }

      return await _createAndLinkNewPatient({
        user,
        phone,
        name,
        clinicId: selectedClinicId,
      });
    }

    // ── PATH A continued: existing record found ───────────────────────────────
    // Phone is not unique per clinic (20260822000000_drop_patient_phone_
    // uniqueness.sql) — households and parent/child patients can legitimately
    // share a number — so more than one active patient can genuinely match
    // here. There is no signal in a phone number alone that picks the right
    // one, so the first match is used; a patient linked to the wrong shared-
    // phone record can be corrected by clinic staff from the patient profile.
    const patient = patients[0];

    // Check the patient isn't already linked to another auth account.
    // Must use the admin client — the portal_links RLS policy only lets a user
    // see their own row (WHERE user_id = auth.uid()), so querying by patient_id
    // to detect a *different* user's link would silently return null and the
    // guard would never fire.
    const { data: patientLinkExists } = await admin
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

    return await _linkExistingPatient({ user, patient });
  } catch (err) {
    // next/navigation redirect throws — rethrow so Next.js handles it
    if (isNextRedirectError(err)) {
      throw err;
    }
    console.error("[linkPortalAccount] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

type AuthUser = { id: string; email?: string };

/**
 * Clears the signup carry-through cookies once portal linking has completed.
 * Failures are non-fatal — the link already succeeded.
 */
async function _clearSignupCookies(): Promise<void> {
  try {
    await clearSignupClinic();
    await clearSignupPhone();
  } catch {
    // Cookie store may be unavailable in some execution contexts — ignore.
  }
}

/**
 * Links an authenticated portal user to an existing patient record.
 * Creates the profiles row as a side-effect (first sign-in state).
 */
async function _linkExistingPatient({
  user,
  patient,
}: {
  user: AuthUser;
  patient: Pick<Patient, "id" | "name" | "clinic_id">;
}): Promise<ActionResult<PortalLinkResult>> {
  const admin: AdminClient = createAdminClient();

  const { error: insertErr } = await admin
    .from("patient_portal_links")
    .insert({ patient_id: patient.id, user_id: user.id });

  if (insertErr) {
    console.error("[linkPortalAccount] portal link insert:", insertErr);
    return { data: null, error: "Failed to link account. Please try again." };
  }

  // Mark the patient record as having completed portal setup.
  await admin
    .from("patients")
    .update({ portal_registered_at: new Date().toISOString() })
    .eq("id", patient.id)
    .is("portal_registered_at", null); // only set once, don't overwrite

  const { data: authUser } = await admin.auth.admin.getUserById(user.id);
  const userEmail = authUser?.user?.email ?? "";

  // Use upsert so a pre-existing profile row (from a prior partial attempt or
  // retry) does not cause a unique-violation that rolls back the portal link.
  // ignoreDuplicates: false means we update the row if it already exists, which
  // is safe — the values are the same (same clinic_id, same role).
  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: user.id,
      clinic_id: patient.clinic_id,
      full_name: patient.name || userEmail.split("@")[0],
      role: "patient",
    },
    { onConflict: "id" }
  );

  if (profileErr) {
    // Roll back the portal link to avoid a half-linked state
    console.error("[linkPortalAccount] profile insert:", profileErr);
    await admin
      .from("patient_portal_links")
      .delete()
      .eq("user_id", user.id)
      .eq("patient_id", patient.id);
    return {
      data: null,
      error: "Account setup failed while creating your profile. Please try again.",
    };
  }

  await _clearSignupCookies();
  revalidatePath("/portal");
  return { data: { status: "linked" }, error: null };
}

/**
 * Creates a new patient record for a self-registering user, then links it.
 *
 * clinic_id is the clinic the patient selected at signup — passed in by the
 * caller after validation. There is no "first clinic" fallback: in a
 * multi-clinic deployment the clinic must always be explicit so records land
 * in the correct tenant and phone numbers stay isolated per clinic.
 */
async function _createAndLinkNewPatient({
  user,
  phone,
  name,
  clinicId,
}: {
  user: AuthUser;
  phone: string;
  name: string;
  clinicId: string;
}): Promise<ActionResult<PortalLinkResult>> {
  const admin: AdminClient = createAdminClient();

  // Guard: don't create a duplicate patient if this phone already exists in the
  // clinic (race condition between two concurrent signups with the same number).
  // phone is already the 10-digit normalized form, so the suffix search matches
  // any stored format (with or without a country code prefix).
  //
  // limit(1) rather than maybeSingle(): phone is no longer unique per clinic
  // (20260822000000_drop_patient_phone_uniqueness.sql — households and
  // parent/child patients legitimately share a number), so this lookup can
  // now match more than one row. maybeSingle() treats >1 row as an error and
  // returns { data: null }, which silently disabled this guard for any phone
  // already shared by two patients — the function would fall through and
  // create a third, duplicate record instead of linking to one of the
  // existing two. limit(1) picks a match deterministically either way.
  const { data: raceMatches } = await admin
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .ilike("phone", `%${phone}`)
    .is("deleted_at", null)
    .limit(1);

  const raceCheck = raceMatches?.[0] as { id: string } | undefined;

  if (raceCheck) {
    // A record appeared between the first lookup and now — link to it instead.
    return await _linkExistingPatient({
      user,
      patient: { id: raceCheck.id, name, clinic_id: clinicId },
    });
  }

  // Create the new patient record, flagged as self-registered.
  // phone is already the 10-digit normalized form — store it as-is so future
  // lookups via the same normalization path always match cleanly.
  const { data: newPatient, error: patientErr } = await admin
    .from("patients")
    .insert({
      clinic_id: clinicId,
      name,
      phone,
      is_self_registered: true,
      portal_registered_at: new Date().toISOString(),
    })
    .select("id, clinic_id")
    .single();

  if (patientErr || !newPatient) {
    console.error("[linkPortalAccount] patient insert:", patientErr);
    return { data: null, error: "Failed to create your patient record. Please try again." };
  }

  // Now link the new patient record to the auth account.
  const { error: linkErr } = await admin
    .from("patient_portal_links")
    .insert({ patient_id: newPatient.id, user_id: user.id });

  if (linkErr) {
    // Roll back the patient record to keep things clean.
    console.error("[linkPortalAccount] portal link insert (new patient):", linkErr);
    await admin.from("patients").delete().eq("id", newPatient.id);
    return { data: null, error: "Failed to link your account. Please try again." };
  }

  // Create the profile row.
  const { data: authUser } = await admin.auth.admin.getUserById(user.id);
  const userEmail = authUser?.user?.email ?? "";

  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: user.id,
      clinic_id: clinicId,
      full_name: name || userEmail.split("@")[0],
      role: "patient",
    },
    { onConflict: "id" }
  );

  if (profileErr) {
    // Roll back both patient record and portal link.
    console.error("[linkPortalAccount] profile insert (new patient):", profileErr);
    await admin
      .from("patient_portal_links")
      .delete()
      .eq("user_id", user.id);
    await admin.from("patients").delete().eq("id", newPatient.id);
    return {
      data: null,
      error: "Account setup failed while creating your profile. Please try again.",
    };
  }

  await _clearSignupCookies();
  revalidatePath("/portal");
  return { data: { status: "linked" }, error: null };
}

// =============================================================================
// getLinkedPatient — resolves authenticated portal user's patient_id + clinic_id
// =============================================================================

export async function getLinkedPatient(): Promise<ActionResult<PortalUser>> {
  try {
    const supabase = await createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Unauthorized" };

    const { data, error } = await supabase
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: "unlinked", error: null };

    const { data } = await supabase
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: any = supabase;

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
//
// Note: this file uses "use server" so only async functions may be exported.
// The PORTAL_UPDATABLE_FIELDS constant and UpdatePortalProfileSchema/Input
// type live in lib/portal-profile.ts so they can be imported by consumers.
// =============================================================================

import {
  UpdatePortalProfileSchema,
} from "@/lib/portal-profile";
import type { PatientUpdate } from "@/types";

export async function updatePortalProfile(
  input: unknown
): Promise<ActionResult<PortalPatientProfile>> {
  try {
    const parsed = UpdatePortalProfileSchema.safeParse(input);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      const fieldName = firstError?.path[0] || "field";
      const message = firstError?.message || "Invalid input";
      return {
        data: null,
        error: `${String(fieldName)}: ${message}`,
      };
    }

    const supabase = await createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: any = supabase;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Unauthorized" };

    // Resolve patient via portal link
    const { data: link, error: linkError } = await db
      .from("patient_portal_links")
      .select("patient_id")
      .eq("user_id", user.id)
      .single();

    if (linkError || !link?.patient_id) {
      console.error("[updatePortalProfile] portal link lookup:", linkError);
      return { data: null, error: "Portal account not linked." };
    }

    // Build a typed update payload — only the fields patients are allowed to edit.
    const updates: PatientUpdate = {
      updated_at: new Date().toISOString(),
      ...(parsed.data.phone !== undefined && { phone: parsed.data.phone || null }),
      ...(parsed.data.address !== undefined && { address: parsed.data.address || null }),
      ...(parsed.data.emergency_contact_name !== undefined && {
        emergency_contact_name: parsed.data.emergency_contact_name || null,
      }),
      ...(parsed.data.emergency_contact_phone !== undefined && {
        emergency_contact_phone: parsed.data.emergency_contact_phone || null,
      }),
    };

    const { data, error } = await db
      .from("patients")
      .update(updates)
      .eq("id", link.patient_id)
      .is("deleted_at", null)
      .select(
        "id, name, phone, date_of_birth, gender, address, emergency_contact_name, emergency_contact_phone, total_visits, last_visit, created_at"
      )
      .single();

    if (error) {
      console.error("[updatePortalProfile] update error:", error);
      
      // Provide more specific error messages based on the error code
      if (error.code === "PGRST116") {
        return { data: null, error: "Profile not found or access denied." };
      }
      if (error.code === "42501") {
        return { data: null, error: "Permission denied. Unable to update profile." };
      }
      if (error.message) {
        return { data: null, error: `Unable to update profile: ${error.message}` };
      }
      
      return { data: null, error: "Unable to update profile. Please try again." };
    }

    if (!data) {
      console.error("[updatePortalProfile] no data returned after update");
      return { data: null, error: "Profile update failed. Please try again." };
    }

    revalidatePath("/portal/profile");
    // Also revalidate dentist and receptionist patient views so changes appear instantly
    revalidatePath("/dentist/patients");
    revalidatePath("/receptionist/patients");

    return { data: data as PortalPatientProfile, error: null };
  } catch (err) {
    console.error("[updatePortalProfile] unexpected error:", err);
    
    // In development, expose the actual error for debugging
    if (process.env.NODE_ENV === "development" && err instanceof Error) {
      return { data: null, error: `Development error: ${err.message}` };
    }
    
    return { data: null, error: "An unexpected error occurred. Please try again." };
  }
}
