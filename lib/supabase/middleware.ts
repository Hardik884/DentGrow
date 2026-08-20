import { type NextRequest, NextResponse } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware-client";

/**
 * updateSession
 *
 * Called from middleware.ts on every matched request.
 *
 * Responsibilities:
 * 1. Refresh the Supabase session cookie.
 * 2. Resolve the authenticated user's role + admin capability from `profiles`.
 * 3. Enforce route-to-audience access rules:
 *    - /admin/*         → requires profiles.is_admin
 *    - /dentist/*       → requires role === 'dentist'
 *    - /receptionist/*  → requires role === 'receptionist'
 *    - /portal/*        → patients only (staff are bounced to their dashboard)
 *    - / (root)         → redirect based on audience
 *    - sign-in pages    → redirect to home if already authenticated
 * 4. For /portal/*: redirect to /portal/setup if no portal link exists.
 * 5. Send unauthenticated visitors to the sign-in page for the area they asked
 *    for, so a patient deep link never dumps them on the staff form.
 *
 * Security note: this is a UX redirect layer. Supabase RLS is the
 * authoritative security boundary, and every /admin page additionally calls
 * requireAdmin() server-side — visiting /admin/login or /admin directly can
 * never bypass authorisation, because nothing here is what grants access.
 */
export async function updateSession(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request);

  // IMPORTANT: do not remove this call — it refreshes the session cookie
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── Server Action POSTs — skip the role/profile lookups ───────────────────
  // A Server Action posts to the page's own route, so this middleware runs on
  // every mutation as well as every navigation. The role lookups below exist
  // only to REDIRECT a browser that navigated to the wrong dashboard; a Server
  // Action never navigates, so their result is discarded — but the request
  // still waited on them. That put one `profiles` query (two on /portal/*, via
  // patient_portal_links) in the critical path of every button in the app, and
  // React `cache()` cannot dedupe it because middleware runs in a different
  // execution context from the action it precedes.
  //
  // Authorisation is NOT weakened by skipping them. Every Server Action
  // re-resolves the caller's profile server-side and re-checks role itself
  // (CLAUDE.md §13.4), and RLS remains the authoritative boundary (§13.10).
  // The unauthenticated redirect below is deliberately still applied.
  const isServerAction =
    request.method === "POST" && request.headers.has("next-action");

  // ── Public auth-recovery routes ────────────────────────────────────────────
  // The patient password-reset flow must be reachable without an existing app
  // session: /forgot-password (logged-out patient requesting a link),
  // /auth/callback (exchanges the recovery code → sets the recovery session),
  // and /reset-password (renders within that recovery session). Skipping the
  // auth gate here prevents the "unauthenticated → sign-in" redirect from
  // breaking the flow. Reset itself still relies on the authenticated Supabase
  // account, never on any clinic selection.
  const PUBLIC_AUTH_PATHS = ["/forgot-password", "/reset-password", "/auth/callback"];
  if (PUBLIC_AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return response();
  }

  // ── Root redirect ──────────────────────────────────────────────────────────
  if (pathname === "/") {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const profile = await resolveProfile(supabase, user.id);
    if (profile === null) {
      // Authenticated but no profile row — mid-onboarding new patient.
      // redirectHome(null) would send to a sign-in page → infinite loop.
      return NextResponse.redirect(new URL("/portal/setup", request.url));
    }
    return redirectHome(profile, request);
  }

  // ── Sign-in / sign-up pages ───────────────────────────────────────────────
  // Three separate doors, plus the legacy /signup alias. An already
  // authenticated visitor is sent to their own home rather than being shown a
  // form they don't need — including on /admin/login, where a non-admin is
  // bounced to their dashboard instead of being invited to try.
  if (SIGN_IN_PATHS.has(pathname)) {
    if (user) {
      const profile = await resolveProfile(supabase, user.id);
      if (profile === null) {
        // Authenticated but no profile yet (new signup, mid-onboarding).
        // Redirecting to a sign-in page here would create an infinite loop
        // because the next visit would hit this same branch again.
        // Send them to /portal/setup to complete account linking instead.
        return NextResponse.redirect(new URL("/portal/setup", request.url));
      }
      return redirectHome(profile, request);
    }
    return response();
  }

  // ── All protected routes — unauthenticated visitors go to the right door ──
  if (!user) {
    const loginUrl = new URL(signInPathFor(pathname), request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated Server Action: the session is refreshed and the caller is
  // known — everything below only computes a redirect this request will never
  // use. See the note above `isServerAction`.
  if (isServerAction) {
    return response();
  }

  // ── /admin/* — requires the platform admin capability ─────────────────────
  // Checked before the role routes because an admin also holds an ordinary
  // role, and because a non-admin must never fall through into this area.
  if (pathname.startsWith("/admin")) {
    const profile = await resolveProfile(supabase, user.id);
    if (!profile?.is_admin) {
      return redirectHome(profile, request);
    }
    return response();
  }

  // ── /dentist/* — requires role === 'dentist' ───────────────────────────────
  if (pathname.startsWith("/dentist")) {
    const profile = await resolveProfile(supabase, user.id);
    if (profile?.role !== "dentist") {
      return redirectHome(profile, request);
    }
    return response();
  }

  // ── /receptionist/* — requires role === 'receptionist' ────────────────────
  if (pathname.startsWith("/receptionist")) {
    const profile = await resolveProfile(supabase, user.id);
    if (profile?.role !== "receptionist") {
      return redirectHome(profile, request);
    }
    return response();
  }

  // ── /portal/* — patient portal; staff are redirected to their dashboard ───
  if (pathname.startsWith("/portal")) {
    // Staff (dentist/receptionist, admin included) must not enter the portal
    // flow — sending them to /portal/setup would invite them to overwrite their
    // own profile (the linking action upserts role = 'patient'). Bounce them to
    // their dashboard instead.
    const profile = await resolveProfile(supabase, user.id);
    if (
      profile &&
      (profile.is_admin ||
        profile.role === "dentist" ||
        profile.role === "receptionist")
    ) {
      return redirectHome(profile, request);
    }

    // /portal/setup is always accessible to authenticated non-staff users
    if (pathname === "/portal/setup") {
      return response();
    }

    const { data: portalLink } = await supabase
      .from("patient_portal_links")
      .select("patient_id")
      .eq("user_id", user.id)
      .single();

    if (!portalLink) {
      return NextResponse.redirect(new URL("/portal/setup", request.url));
    }

    return response();
  }

  return response();
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * The three sign-in doors, plus /signup which redirects to /patient/signup.
 * Listed as a Set so the check stays a single exact-match lookup.
 */
const SIGN_IN_PATHS = new Set([
  "/login",
  "/patient/login",
  "/patient/signup",
  "/signup",
  "/admin/login",
]);

// The middleware supabase client is synchronous (not async)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

type MiddlewareProfile = {
  role: "dentist" | "receptionist" | "patient";
  is_admin: boolean;
};

/** Resolve role + admin capability from profiles. Null if there is no row. */
async function resolveProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<MiddlewareProfile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("role, is_admin")
    .eq("id", userId)
    .single();

  const row = data as MiddlewareProfile | null;
  if (!row) return null;
  return { role: row.role, is_admin: row.is_admin === true };
}

/**
 * Which sign-in page a logged-out visitor should land on, based on where they
 * were trying to go. Keeps a bookmarked portal link out of the staff form.
 */
function signInPathFor(pathname: string): string {
  if (pathname.startsWith("/admin")) return "/admin/login";
  if (pathname.startsWith("/portal") || pathname.startsWith("/patient")) {
    return "/patient/login";
  }
  return "/login";
}

/** Send a known profile to its home route. */
function redirectHome(
  profile: MiddlewareProfile | null,
  request: NextRequest
): NextResponse {
  if (profile?.is_admin) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  switch (profile?.role) {
    case "dentist":
      return NextResponse.redirect(new URL("/dentist", request.url));
    case "receptionist":
      return NextResponse.redirect(new URL("/receptionist", request.url));
    case "patient":
      return NextResponse.redirect(new URL("/portal", request.url));
    default:
      // No profile row yet — user is mid-onboarding (signed up but hasn't
      // completed portal linking). Send to /portal/setup rather than a sign-in
      // page to avoid a redirect loop: /login → redirectHome(null) → /login → ∞
      return NextResponse.redirect(new URL("/portal/setup", request.url));
  }
}
