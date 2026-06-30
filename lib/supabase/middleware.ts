import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database.types";

/**
 * updateSession
 *
 * Called from middleware.ts on every matched request.
 *
 * Responsibilities:
 * 1. Refresh the Supabase session cookie.
 * 2. Resolve the authenticated user's role from profiles table.
 * 3. Enforce route-to-role access rules:
 *    - /dentist/*       → requires role === 'dentist'
 *    - /receptionist/*  → requires role === 'receptionist'
 *    - /portal/*        → requires any authenticated user
 *    - / (root)         → redirect based on role
 *    - /login, /signup  → redirect to dashboard if already authenticated
 * 4. For /portal/*: redirect to /portal/setup if no portal link exists.
 *
 * Security note: this is a UX redirect layer. Supabase RLS is the
 * authoritative security boundary — middleware guards only prevent
 * accidental navigation to wrong-role pages.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not remove this call — it refreshes the session cookie
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── Public auth-recovery routes ────────────────────────────────────────────
  // The patient password-reset flow must be reachable without an existing app
  // session: /forgot-password (logged-out patient requesting a link),
  // /auth/callback (exchanges the recovery code → sets the recovery session),
  // and /reset-password (renders within that recovery session). Skipping the
  // auth gate here prevents the "unauthenticated → /login" redirect from
  // breaking the flow. Reset itself still relies on the authenticated Supabase
  // account, never on any clinic selection.
  const PUBLIC_AUTH_PATHS = ["/forgot-password", "/reset-password", "/auth/callback"];
  if (PUBLIC_AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return supabaseResponse;
  }

  // ── Root redirect ──────────────────────────────────────────────────────────
  if (pathname === "/") {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const role = await resolveRole(supabase, user.id);
    if (role === null) {
      // Authenticated but no profile row — mid-onboarding new user.
      // redirectByKnownRole(null) would send to /login → infinite loop.
      return NextResponse.redirect(new URL("/portal/setup", request.url));
    }
    return redirectByKnownRole(role, request);
  }

  // ── Auth pages — bounce authenticated users to their dashboard ─────────────
  if (pathname === "/login" || pathname === "/signup") {
    if (user) {
      const role = await resolveRole(supabase, user.id);
      if (role === null) {
        // Authenticated but no profile yet (new signup, mid-onboarding).
        // Redirecting to /login here would create an infinite loop because
        // the next visit to /login would hit this same branch again.
        // Send them to /portal/setup to complete account linking instead.
        return NextResponse.redirect(new URL("/portal/setup", request.url));
      }
      return redirectByKnownRole(role, request);
    }
    return supabaseResponse;
  }

  // ── All protected routes — unauthenticated users go to /login ─────────────
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── /dentist/* — requires role === 'dentist' ───────────────────────────────
  if (pathname.startsWith("/dentist")) {
    const role = await resolveRole(supabase, user.id);
    if (role !== "dentist") {
      return redirectByKnownRole(role, request);
    }
    return supabaseResponse;
  }

  // ── /receptionist/* — requires role === 'receptionist' ────────────────────
  if (pathname.startsWith("/receptionist")) {
    const role = await resolveRole(supabase, user.id);
    if (role !== "receptionist") {
      return redirectByKnownRole(role, request);
    }
    return supabaseResponse;
  }

  // ── /portal/* — patient portal; staff are redirected to their dashboard ───
  if (pathname.startsWith("/portal")) {
    // Staff (dentist/receptionist) must not enter the portal flow — sending
    // them to /portal/setup would invite them to overwrite their own profile
    // (the linking action upserts role = 'patient'). Bounce them to their
    // dashboard instead.
    const role = await resolveRole(supabase, user.id);
    if (role === "dentist" || role === "receptionist") {
      return redirectByKnownRole(role, request);
    }

    // /portal/setup is always accessible to authenticated non-staff users
    if (pathname === "/portal/setup") {
      return supabaseResponse;
    }

    const { data: portalLink } = await supabase
      .from("patient_portal_links")
      .select("patient_id")
      .eq("user_id", user.id)
      .single();

    if (!portalLink) {
      return NextResponse.redirect(new URL("/portal/setup", request.url));
    }

    return supabaseResponse;
  }

  return supabaseResponse;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// The middleware supabase client is synchronous (not async)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/** Resolve the user's role from the profiles table. Returns null if not found. */
async function resolveRole(
  supabase: SupabaseClient,
  userId: string
): Promise<"dentist" | "receptionist" | "patient" | null> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const row = data as { role: "dentist" | "receptionist" | "patient" } | null;
  return row?.role ?? null;
}

/** Map a known role value to its home route and return a redirect. */
function redirectByKnownRole(
  role: "dentist" | "receptionist" | "patient" | null,
  request: NextRequest
): NextResponse {
  switch (role) {
    case "dentist":
      return NextResponse.redirect(new URL("/dentist", request.url));
    case "receptionist":
      return NextResponse.redirect(new URL("/receptionist", request.url));
    case "patient":
      return NextResponse.redirect(new URL("/portal", request.url));
    default:
      // No profile row yet — user is mid-onboarding (signed up but hasn't
      // completed portal linking). Send to /portal/setup rather than /login
      // to avoid a redirect loop: /login → redirectByRole → null → /login → ∞
      return NextResponse.redirect(new URL("/portal/setup", request.url));
  }
}
