"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getClinicById } from "@/actions/clinics";
import {
  setSelectedClinic,
  clearSelectedClinic,
  setSignupClinic,
  clearSignupClinic,
  setSignupPhone,
  clearSignupPhone,
} from "@/lib/clinic-session";
import type { ActionResult } from "@/types";

// ── Sign In ────────────────────────────────────────────────────────────────────

/**
 * signIn
 *
 * Authenticates a user with email + password via Supabase Auth, scoped to the
 * clinic the user selected in the required Clinic dropdown.
 *
 * Cross-clinic protection:
 *   After authentication we resolve the user's profile and verify that
 *   profile.clinic_id matches the clinic they selected. If it does not match,
 *   we immediately sign them back out and return a friendly error. A dentist or
 *   receptionist from one clinic can therefore never sign in "into" another
 *   clinic, even with valid credentials.
 *
 * On success, resolves their role from the profiles table and redirects
 * to the appropriate dashboard:
 *   dentist       → /dentist
 *   receptionist  → /receptionist
 *   patient       → /portal
 *
 * Returns an error string if authentication fails so the form can display it.
 * Never returns on success — redirect() throws internally.
 */
export async function signIn(
  _prevState: ActionResult<null>,
  formData: FormData
): Promise<ActionResult<null>> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const clinicId = (formData.get("clinic_id") as string) || "";

  if (!clinicId) {
    return { data: null, error: "Please select a clinic." };
  }

  if (!email || !password) {
    return { data: null, error: "Email and password are required." };
  }

  // Validate the selected clinic actually exists before authenticating.
  const clinicResult = await getClinicById(clinicId);
  if (!clinicResult.data) {
    return { data: null, error: clinicResult.error ?? "Invalid clinic." };
  }

  const supabase = await createServerClient();

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (authError || !authData.user) {
    return {
      data: null,
      error: authError?.message ?? "Invalid email or password.",
    };
  }

  // Resolve role + clinic for the cross-clinic check and redirect.
  const { data: profileData } = await supabase
    .from("profiles")
    .select("role, clinic_id")
    .eq("id", authData.user.id)
    .single();

  const profileRow = profileData as
    | { role: "dentist" | "receptionist" | "patient"; clinic_id: string }
    | null;

  // ── Cross-clinic guard ──────────────────────────────────────────────────
  // If the user has a profile and its clinic_id does not match the selected
  // clinic, deny the login and clear the session. Patients mid-onboarding have
  // no profile yet (profileRow === null) and are handled by the redirect below.
  if (profileRow && profileRow.clinic_id !== clinicId) {
    await supabase.auth.signOut();
    return {
      data: null,
      error: "This account belongs to a different clinic.",
    };
  }

  const role = profileRow?.role ?? null;

  // Persist the selected clinic for the session (display/UX only — data access
  // remains authorised by profiles.clinic_id + RLS).
  await setSelectedClinic(clinicId);

  switch (role) {
    case "dentist":
      redirect("/dentist");
    case "receptionist":
      redirect("/receptionist");
    case "patient":
      redirect("/portal");
    default: {
      // No profile row found. For patient self-registrations this means the
      // user created an auth account but hasn't completed portal setup yet
      // (linkPortalAccount creates the profile). Send them to /portal/setup
      // so they can finish linking. Do NOT sign them out — the setup page
      // requires an active session.
      //
      // For staff accounts this state should never occur in production
      // (staff are created via the invite flow which always inserts a profile).
      // If it does, the setup page will surface a clear message.
      redirect("/portal/setup");
    }
  }
}

// ── Sign Up ────────────────────────────────────────────────────────────────────

/**
 * signUp
 *
 * Creates a new Supabase Auth account for patient portal self-registration,
 * scoped to the clinic chosen in the required Clinic dropdown.
 *
 * The selected clinic is carried through the rest of the signup flow via the
 * signup-clinic cookie: /portal/setup and linkPortalAccount use it so the
 * patient lookup, linking, and (if needed) creation all happen inside the
 * chosen clinic only. The same phone number in a different clinic is never
 * matched.
 *
 * Staff accounts are created out-of-band (invite flow in production).
 *
 * After signup, redirects to /portal/setup for the patient→account linking flow.
 * Returns an error string on failure.
 */
export async function signUp(
  _prevState: ActionResult<null>,
  formData: FormData
): Promise<ActionResult<null>> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  const clinicId = (formData.get("clinic_id") as string) || "";
  const phone = ((formData.get("phone") as string) || "").trim();

  if (!clinicId) {
    return { data: null, error: "Please select a clinic." };
  }

  if (!email || !password || !confirmPassword) {
    return { data: null, error: "All fields are required." };
  }

  if (password !== confirmPassword) {
    return { data: null, error: "Passwords do not match." };
  }

  if (password.length < 8) {
    return { data: null, error: "Password must be at least 8 characters." };
  }

  // Validate the selected clinic before creating the account.
  const clinicResult = await getClinicById(clinicId);
  if (!clinicResult.data) {
    return { data: null, error: clinicResult.error ?? "Invalid clinic." };
  }

  const supabase = await createServerClient();

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Redirect after email confirmation — handled by Supabase Auth
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/portal/setup`,
    },
  });

  if (signUpError) {
    return { data: null, error: signUpError.message };
  }

  // Carry the chosen clinic (and selection) through to /portal/setup so the
  // patient link/create step is scoped to this clinic only.
  await setSignupClinic(clinicId);
  await setSelectedClinic(clinicId);
  if (phone) await setSignupPhone(phone);

  // Redirect immediately to setup — if email confirmation is required,
  // the setup page will surface the "check your email" message.
  redirect("/portal/setup");
}

// ── Sign Out ───────────────────────────────────────────────────────────────────

/**
 * signOut
 *
 * Signs the current user out of Supabase Auth and redirects to /login.
 * Safe to call from any role context.
 */
export async function signOut(): Promise<void> {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  // Clear the selected-clinic UX cookies so a fresh login must re-select.
  await clearSelectedClinic();
  await clearSignupClinic();
  await clearSignupPhone();
  redirect("/login");
}
