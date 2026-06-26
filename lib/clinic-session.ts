import { cookies } from "next/headers";

/**
 * lib/clinic-session.ts
 *
 * Cookie helpers for the selected-clinic UX layer.
 *
 * IMPORTANT — security model:
 *   These cookies are a UX/display convenience only. They are NEVER trusted
 *   for data access decisions. All clinic-scoped data access is authorised by
 *   the authenticated user's profiles.clinic_id and enforced by Supabase RLS
 *   (auth_clinic_id()). A tampered cookie cannot expose another clinic's data.
 *
 * Two cookies are used:
 *   - SELECTED_CLINIC_COOKIE: the clinic the logged-in session is operating in.
 *       Set on successful login/signup, cleared on logout.
 *   - SIGNUP_CLINIC_COOKIE: the clinic chosen on the create-account page,
 *       carried through to /portal/setup so patient linking/creation is scoped
 *       to the right clinic. Cleared once linking completes.
 *
 * These helpers may only be called from Server Actions / Route Handlers
 * (where cookies can be written) or Server Components (read-only).
 */

export const SELECTED_CLINIC_COOKIE = "dg_selected_clinic";
export const SIGNUP_CLINIC_COOKIE = "dg_signup_clinic";
export const SIGNUP_PHONE_COOKIE = "dg_signup_phone";

const COMMON_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** Persist the selected clinic for the logged-in session. */
export async function setSelectedClinic(clinicId: string): Promise<void> {
  const store = await cookies();
  store.set(SELECTED_CLINIC_COOKIE, clinicId, {
    ...COMMON_OPTIONS,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

/** Read the selected clinic for the current session (display only). */
export async function getSelectedClinic(): Promise<string | null> {
  const store = await cookies();
  return store.get(SELECTED_CLINIC_COOKIE)?.value ?? null;
}

/** Clear the selected clinic — called on logout. */
export async function clearSelectedClinic(): Promise<void> {
  const store = await cookies();
  store.delete(SELECTED_CLINIC_COOKIE);
}

/** Carry the chosen clinic from create-account through to portal setup. */
export async function setSignupClinic(clinicId: string): Promise<void> {
  const store = await cookies();
  store.set(SIGNUP_CLINIC_COOKIE, clinicId, {
    ...COMMON_OPTIONS,
    maxAge: 60 * 60, // 1 hour — long enough to complete setup
  });
}

/** Read the clinic chosen during signup (used by /portal/setup). */
export async function getSignupClinic(): Promise<string | null> {
  const store = await cookies();
  return store.get(SIGNUP_CLINIC_COOKIE)?.value ?? null;
}

/** Clear the signup clinic cookie once linking completes. */
export async function clearSignupClinic(): Promise<void> {
  const store = await cookies();
  store.delete(SIGNUP_CLINIC_COOKIE);
}

/** Carry the phone entered at create-account through to portal setup (prefill). */
export async function setSignupPhone(phone: string): Promise<void> {
  const store = await cookies();
  store.set(SIGNUP_PHONE_COOKIE, phone, {
    ...COMMON_OPTIONS,
    maxAge: 60 * 60, // 1 hour
  });
}

/** Read the phone entered during signup (used to prefill /portal/setup). */
export async function getSignupPhone(): Promise<string | null> {
  const store = await cookies();
  return store.get(SIGNUP_PHONE_COOKIE)?.value ?? null;
}

/** Clear the signup phone cookie once linking completes. */
export async function clearSignupPhone(): Promise<void> {
  const store = await cookies();
  store.delete(SIGNUP_PHONE_COOKIE);
}
