"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/app-url";
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

/**
 * actions/auth.ts — DentGrow authentication.
 *
 * DentGrow has THREE separate sign-in entry points, one per audience. They are
 * separate on purpose: each one knows exactly who it is for, so none of them
 * has to ask the visitor to describe themselves with a role picker or a clinic
 * dropdown.
 *
 *   /login          → signInStaff    → dentists and receptionists
 *   /patient/login  → signInPatient  → patients (portal)
 *   /admin/login    → signInAdmin    → platform admin / developer only
 *
 * The single rule that makes this safe: NOTHING about who you are comes from
 * the browser. The form posts an email and a password, nothing else. Role,
 * clinic and admin capability are all read from the `profiles` row that belongs
 * to the authenticated user, server-side, after the password check. A visitor
 * cannot pick their clinic, cannot claim a role, and cannot reach the admin
 * portal by typing its URL.
 *
 * A clinic is chosen in exactly one place in the whole product — the NEW
 * patient signup form — and even there the chosen id is validated against the
 * clinics table before it is used for anything (see signUpPatient).
 *
 * Each entry point also refuses accounts that belong to a different audience,
 * so a patient cannot sign in "into" the staff app and an admin cannot quietly
 * sign in through the staff door.
 */

// ── Audiences ─────────────────────────────────────────────────────────────────

/** Where a signed-in account belongs, resolved entirely server-side. */
type Audience = "admin" | "staff" | "patient" | "unlinked";

type AuthedProfile = {
  role: "dentist" | "receptionist" | "patient";
  clinic_id: string;
  is_admin: boolean;
};

/** Home route for an audience, used after a successful sign-in. */
function homeFor(profile: AuthedProfile | null): string {
  if (!profile) return "/portal/setup";
  if (profile.is_admin) return "/admin";
  switch (profile.role) {
    case "dentist":
      return "/dentist";
    case "receptionist":
      return "/receptionist";
    default:
      return "/portal";
  }
}

function audienceOf(profile: AuthedProfile | null): Audience {
  if (!profile) return "unlinked";
  // Admin wins over role: owner@dentgrow.local is a dentist AND an admin, and
  // the admin door is the only one it is allowed through.
  if (profile.is_admin) return "admin";
  if (profile.role === "dentist" || profile.role === "receptionist") return "staff";
  return "patient";
}

/**
 * Human-readable message for a Supabase Auth failure.
 *
 * Raw Supabase errors are never surfaced (CLAUDE.md §13.1) — they leak
 * implementation detail and read as gibberish to a receptionist. Every unknown
 * failure collapses to the same generic line, which also keeps the response
 * uniform for anyone probing which addresses exist.
 */
function friendlyAuthError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "That email and password don't match an account.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email address, then sign in.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  return "We couldn't sign you in. Please check your details and try again.";
}

/**
 * authenticate — password check + server-side profile resolution.
 *
 * Shared by all three sign-in actions. Returns either a friendly error string
 * or the caller's real profile. Never trusts anything from the form beyond the
 * email and password themselves.
 */
async function authenticate(
  formData: FormData
): Promise<{ error: string } | { profile: AuthedProfile | null }> {
  const email = ((formData.get("email") as string) ?? "").trim();
  const password = (formData.get("password") as string) ?? "";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createServerClient();

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (authError || !authData.user) {
    return { error: friendlyAuthError(authError?.message) };
  }

  const { data } = await supabase
    .from("profiles")
    .select("role, clinic_id, is_admin")
    .eq("id", authData.user.id)
    .single();

  return { profile: (data as AuthedProfile | null) ?? null };
}

/** Sign the just-authenticated session back out after an audience mismatch. */
async function rejectAndSignOut(error: string): Promise<ActionResult<null>> {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  await clearSelectedClinic();
  return { data: null, error };
}

// ── Staff sign-in — /login ────────────────────────────────────────────────────

/**
 * signInStaff
 *
 * The clinic sign-in, for dentists and receptionists only.
 *
 * There is no clinic dropdown and no role picker. After the password check we
 * read the caller's profile and send them to the portal their role entitles
 * them to; their clinic comes from profiles.clinic_id and is enforced from
 * there on by RLS (auth_clinic_id()), so cross-clinic access is impossible
 * regardless of what the browser sends.
 *
 * Accounts that belong to another door are refused and signed straight back
 * out — a patient is pointed at the patient portal, and the platform admin is
 * told only that this is not its entry point.
 */
export async function signInStaff(
  _prevState: ActionResult<null>,
  formData: FormData
): Promise<ActionResult<null>> {
  const result = await authenticate(formData);
  if ("error" in result) return { data: null, error: result.error };

  const { profile } = result;

  switch (audienceOf(profile)) {
    case "staff":
      break;
    case "admin":
      return rejectAndSignOut(
        "This account doesn't have clinic access. Use its own sign-in page."
      );
    default:
      return rejectAndSignOut(
        "This is the staff sign-in. Patients can sign in at the patient portal."
      );
  }

  // Display-only convenience so clinic chrome renders immediately. Never an
  // access decision — RLS reads the clinic from the profile, not this cookie.
  await setSelectedClinic(profile!.clinic_id);

  redirect(homeFor(profile));
}

// ── Patient sign-in — /patient/login ──────────────────────────────────────────

/**
 * signInPatient
 *
 * The patient portal sign-in. No clinic dropdown: an existing patient's clinic
 * is already recorded on their patient record, and is resolved through
 * patient_portal_links → patients.clinic_id.
 *
 * A patient who signed up but never finished linking their record has no
 * profile row yet; they are sent to /portal/setup to finish, exactly as before.
 * Staff and admin accounts are refused here.
 */
export async function signInPatient(
  _prevState: ActionResult<null>,
  formData: FormData
): Promise<ActionResult<null>> {
  const result = await authenticate(formData);
  if ("error" in result) return { data: null, error: result.error };

  const { profile } = result;
  const audience = audienceOf(profile);

  if (audience === "staff" || audience === "admin") {
    return rejectAndSignOut(
      "This is the patient portal. Clinic staff sign in on the staff page."
    );
  }

  if (profile) await setSelectedClinic(profile.clinic_id);

  // "unlinked" → /portal/setup, "patient" → /portal.
  redirect(homeFor(profile));
}

// ── Admin sign-in — /admin/login ──────────────────────────────────────────────

/**
 * signInAdmin
 *
 * The platform admin / developer entry point.
 *
 * The URL is not the security boundary — this action is. Any account can
 * submit this form; only one whose profile carries is_admin = true is let
 * through, and everyone else is signed straight back out with the same
 * message, whether or not their password was correct in the first place. The
 * flag itself cannot be granted from the browser: the profiles UPDATE policy
 * pins is_admin to its previous value (migration 20260821000000).
 */
export async function signInAdmin(
  _prevState: ActionResult<null>,
  formData: FormData
): Promise<ActionResult<null>> {
  const result = await authenticate(formData);
  if ("error" in result) return { data: null, error: result.error };

  const { profile } = result;

  if (!profile?.is_admin) {
    return rejectAndSignOut("This account is not authorized for admin access.");
  }

  await setSelectedClinic(profile.clinic_id);

  redirect("/admin");
}

// ── New patient signup — /patient/signup ──────────────────────────────────────

/**
 * signUpPatient
 *
 * Creates a Supabase Auth account for a patient registering themselves, at the
 * clinic they picked on the form.
 *
 * This is the ONLY place in DentGrow where a clinic is chosen in the browser,
 * and the id is verified against the clinics table before it is used — a
 * tampered value is rejected outright rather than silently scoping the new
 * patient into a clinic that does not exist. From here the choice travels in an
 * httpOnly cookie to /portal/setup, so the record lookup and (if needed)
 * creation happen inside that clinic only; the same phone number at a different
 * clinic is never matched.
 *
 * Staff accounts are never created here — they are provisioned by the clinic.
 */
export async function signUpPatient(
  _prevState: ActionResult<null>,
  formData: FormData
): Promise<ActionResult<null>> {
  const email = ((formData.get("email") as string) ?? "").trim();
  const password = (formData.get("password") as string) ?? "";
  const confirmPassword = (formData.get("confirmPassword") as string) ?? "";
  const clinicId = ((formData.get("clinic_id") as string) || "").trim();
  const phone = ((formData.get("phone") as string) || "").trim();
  const fullName = ((formData.get("full_name") as string) || "").trim();

  if (!clinicId) {
    return { data: null, error: "Please choose the clinic you attend." };
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

  // Never trust a clinic id from the browser — verify it exists first.
  const clinicResult = await getClinicById(clinicId);
  if (!clinicResult.data) {
    return { data: null, error: clinicResult.error ?? "Invalid clinic." };
  }

  const supabase = await createServerClient();

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: fullName ? { full_name: fullName } : undefined,
      // Redirect after email confirmation — handled by Supabase Auth.
      // Origin is resolved from the live request so the link is correct per
      // environment (never a build-time-baked localhost URL in production).
      emailRedirectTo: await getAppUrl("/portal/setup"),
    },
  });

  if (signUpError) {
    const m = signUpError.message.toLowerCase();
    if (m.includes("already registered") || m.includes("already been registered")) {
      return {
        data: null,
        error: "An account with this email already exists. Try signing in instead.",
      };
    }
    return { data: null, error: friendlyAuthError(signUpError.message) };
  }

  // Carry the chosen clinic (and phone) through to /portal/setup so the
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
 * Signs the current user out and returns them to THEIR sign-in page, so a
 * patient is never dropped onto the staff form (or vice versa). Safe to call
 * from any role context.
 */
export async function signOut(): Promise<void> {
  const supabase = await createServerClient();

  // Resolve where to land BEFORE destroying the session.
  let destination = "/login";
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("role, clinic_id, is_admin")
      .eq("id", user.id)
      .single();

    const profile = (data as AuthedProfile | null) ?? null;
    const audience = audienceOf(profile);
    destination =
      audience === "admin"
        ? "/admin/login"
        : audience === "staff"
          ? "/login"
          : "/patient/login";
  }

  await supabase.auth.signOut();
  // Clear the selected-clinic UX cookies so a fresh login re-resolves them.
  await clearSelectedClinic();
  await clearSignupClinic();
  await clearSignupPhone();
  redirect(destination);
}

// ── Password Reset (patients only) ───────────────────────────────────────────

/**
 * isPasswordResetEligible
 *
 * Patient-only gate for self-service password reset.
 *
 * Self-service reset is available to PATIENTS ONLY — dentist, receptionist and
 * admin accounts are managed by the clinic owner / platform administrator and
 * must never receive a self-service reset email.
 *
 * Because the email→role mapping lives in auth.users (email) + profiles (role),
 * we resolve the auth user by email via the service-role admin client, then read
 * their profile role:
 *   - role === 'patient'  → eligible
 *   - role === null       → eligible (a patient mid-onboarding has an auth
 *                           account but no profile yet; staff always have a
 *                           profile, created by the invite flow)
 *   - dentist / receptionist / any admin → NOT eligible (silently skipped)
 *
 * Returns false for unknown emails too. The caller always reports the same
 * generic success message regardless, so this never reveals whether an account
 * exists or what role it has.
 */
async function isPasswordResetEligible(email: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = createAdminClient();
  const target = email.trim().toLowerCase();

  const perPage = 200;
  // Pilot scale: a handful of clinics. Cap the scan so a missing account can
  // never turn into an unbounded loop.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users) break;

    const user = data.users.find(
      (u: { email?: string | null }) => (u.email ?? "").toLowerCase() === target
    );

    if (user) {
      const { data: profile } = await admin
        .from("profiles")
        .select("role, is_admin")
        .eq("id", user.id)
        .maybeSingle();

      const row = (profile as { role?: string; is_admin?: boolean } | null) ?? null;
      if (row?.is_admin) return false;
      const role = row?.role ?? null;
      return role === "patient" || role === null;
    }

    // Reached the last page — stop scanning.
    if (data.users.length < perPage) break;
  }

  return false;
}

/**
 * requestPasswordReset
 *
 * Step 1 of the patient password-reset flow (triggered from /forgot-password).
 *
 * Sends a Supabase password-recovery email — but only when the address belongs
 * to a patient account (see isPasswordResetEligible). The recovery link points
 * at /auth/callback, which exchanges the recovery code for a session and then
 * forwards to /reset-password.
 *
 * Security:
 *   - Patient-only: staff and admin accounts never receive a reset email.
 *   - Enumeration-safe: the response is ALWAYS a generic success, so the caller
 *     cannot tell whether the email exists or what role it has.
 *   - Clinic-independent: reset relies on the authenticated Supabase account,
 *     not on any clinic selection, so it is immune to cross-clinic tampering.
 *
 * Returns an error only for input validation or unexpected system failures.
 */
export async function requestPasswordReset(
  _prevState: ActionResult<{ sent: true }>,
  formData: FormData
): Promise<ActionResult<{ sent: true }>> {
  const email = ((formData.get("email") as string) || "").trim();

  // Basic email shape validation.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { data: null, error: "Please enter a valid email address." };
  }

  try {
    if (await isPasswordResetEligible(email)) {
      const supabase = await createServerClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // Origin is resolved from the live request at runtime, so production
        // emails always point at the deployed domain and dev emails at
        // localhost — never a build-time-inlined NEXT_PUBLIC_APP_URL value.
        redirectTo: await getAppUrl("/auth/callback?next=/reset-password"),
      });
      // A genuine send failure is a system problem, not an existence signal.
      if (error) {
        console.error("[requestPasswordReset] send failed:", error);
        return {
          data: null,
          error: "We couldn't send the reset email. Please try again.",
        };
      }
    }
  } catch (err) {
    console.error("[requestPasswordReset] unexpected:", err);
    return {
      data: null,
      error: "Something went wrong. Please try again.",
    };
  }

  // Always generic — never reveal whether the account exists or its role.
  return { data: { sent: true }, error: null };
}

/**
 * updatePassword
 *
 * Step 2 of the patient password-reset flow (submitted from /reset-password).
 *
 * Runs inside the short-lived recovery session established by /auth/callback.
 * Validates the new password against the existing policy (min 8 chars + match),
 * updates it via Supabase Auth, then signs the recovery session out so the
 * patient must sign in again with their new credentials.
 *
 * Returns an error string on failure; on success returns { updated: true } and
 * the client redirects to /patient/login?reset=1.
 */
export async function updatePassword(
  _prevState: ActionResult<{ updated: true }>,
  formData: FormData
): Promise<ActionResult<{ updated: true }>> {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    return { data: null, error: "All fields are required." };
  }

  if (password !== confirmPassword) {
    return { data: null, error: "Passwords do not match." };
  }

  // Existing password policy (mirrors signup): minimum 8 characters.
  if (password.length < 8) {
    return { data: null, error: "Password must be at least 8 characters." };
  }

  const supabase = await createServerClient();

  // The recovery session must be present (set by /auth/callback). Without it
  // the link is invalid or expired and we cannot update anything.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      data: null,
      error: "Your reset link is invalid or has expired. Please request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { data: null, error: friendlyAuthError(error.message) };
  }

  // Sign the recovery session out so the patient re-authenticates with the new
  // password. Clear the selected-clinic UX cookie too for a clean re-login.
  await supabase.auth.signOut();
  await clearSelectedClinic();

  return { data: { updated: true }, error: null };
}
