import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { recordSecurityEvent } from "@/lib/security/events";

/**
 * lib/auth/session.ts
 *
 * Request-scoped session + profile resolver.
 *
 * Why this exists:
 *   Every Server Action and Server Component previously resolved the session
 *   independently — each calling `supabase.auth.getUser()` (a network round-trip
 *   to the Supabase Auth server) followed by a `profiles` lookup. A single page
 *   render that fans out into N read-actions therefore paid for N identical
 *   auth round-trips + N identical profile queries.
 *
 *   `resolveSession` is wrapped in React `cache()`, which memoises the result
 *   for the duration of a single server request (one render pass / one action
 *   invocation). The first caller pays for the auth + profile lookup; every
 *   subsequent caller in the same request gets the memoised value for free.
 *
 *   Net effect: at most ONE `auth.getUser()` and ONE `profiles` query per
 *   request, no matter how many components or helpers ask for the session.
 *
 * Security is unchanged: `auth.getUser()` still validates the JWT against the
 * Auth server (once), and clinic_id/role are still sourced from the server
 * profile — never from the client.
 */

// The @supabase/ssr server client infers `never` for some table types in strict
// mode. The data layer is cast to `any` at this boundary, matching the existing
// per-action convention.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = any;

export type SessionRole = "dentist" | "receptionist" | "patient";

export type ResolvedProfile = {
  id: string;
  clinic_id: string;
  role: SessionRole;
  full_name: string | null;
  /**
   * Platform admin / developer capability. ADDITIVE to `role` — an admin keeps
   * its normal role and clinic and behaves like any other staff member inside
   * the app; the flag only gates the /admin portal and its dedicated sign-in
   * page. Set server-side only: the profiles UPDATE policy pins it, so a client
   * cannot grant it to itself (migration 20260821000000).
   */
  is_admin: boolean;
};

export type ResolvedSession = {
  db: DbClient;
  user: { id: string; email?: string | null } | null;
  profile: ResolvedProfile | null;
};

/**
 * resolveSession — request-scoped, memoised.
 *
 * Returns the Supabase server client, the authenticated user, and the caller's
 * profile (id, clinic_id, role, full_name). Memoised per request via cache().
 */
export const resolveSession = cache(async (): Promise<ResolvedSession> => {
  const supabase = await createServerClient();
  const db = supabase as unknown as DbClient;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { db, user: null, profile: null };

  const { data } = await db
    .from("profiles")
    .select("id, clinic_id, role, full_name, is_admin")
    .eq("id", user.id)
    .single();

  const row = (data as ResolvedProfile | null) ?? null;

  return {
    db,
    user,
    // Normalise is_admin to a real boolean so callers can treat it as a plain
    // predicate without worrying about null from an older row.
    profile: row ? { ...row, is_admin: row.is_admin === true } : null,
  };
});

/**
 * requireAdmin — server-side gate for every /admin surface.
 *
 * The admin URL is NOT the security boundary; this is. Call it at the top of
 * any admin page or action. A visitor with no session goes to the admin
 * sign-in; an authenticated non-admin (an ordinary dentist, receptionist or
 * patient who typed the URL) is bounced to their own home, so the admin area
 * never even acknowledges what it is to them.
 *
 * Middleware performs the same check for fast redirects, but it is a UX layer:
 * this call is what actually protects the page (CLAUDE.md §13.10).
 */
export async function requireAdmin(): Promise<ResolvedProfile> {
  const { user, profile } = await resolveSession();

  if (!user) redirect("/admin/login");

  if (!profile?.is_admin) {
    // An authenticated non-admin who reached an /admin URL. The URL is not
    // linked from anywhere in the product, so this is worth seeing in a log
    // even though the redirect below is doing its job.
    recordSecurityEvent("ADMIN_ACCESS_DENIED", {
      userId: user.id,
      clinicId: profile?.clinic_id ?? null,
      role: profile?.role ?? null,
      surface: "admin",
    });

    switch (profile?.role) {
      case "dentist":
        redirect("/dentist");
      case "receptionist":
        redirect("/receptionist");
      default:
        redirect("/portal");
    }
  }

  return profile;
}
