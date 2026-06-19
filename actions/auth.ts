"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

// ── Sign In ────────────────────────────────────────────────────────────────────

/**
 * signIn
 *
 * Authenticates a user with email + password via Supabase Auth.
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

  if (!email || !password) {
    return { data: null, error: "Email and password are required." };
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

  // Resolve role for redirect
  const { data: profileData } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  const profileRow = profileData as { role: "dentist" | "receptionist" | "patient" } | null;
  const role = profileRow?.role ?? null;

  switch (role) {
    case "dentist":
      redirect("/dentist");
    case "receptionist":
      redirect("/receptionist");
    case "patient":
      redirect("/portal");
    default:
      // Auth succeeded but no profile — this is an incomplete onboarding state
      await supabase.auth.signOut();
      return {
        data: null,
        error:
          "Your account is not fully set up. Please contact your clinic administrator.",
      };
  }
}

// ── Sign Up ────────────────────────────────────────────────────────────────────

/**
 * signUp
 *
 * Creates a new Supabase Auth account for patient portal self-registration.
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

  if (!email || !password || !confirmPassword) {
    return { data: null, error: "All fields are required." };
  }

  if (password !== confirmPassword) {
    return { data: null, error: "Passwords do not match." };
  }

  if (password.length < 8) {
    return { data: null, error: "Password must be at least 8 characters." };
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
  redirect("/login");
}
