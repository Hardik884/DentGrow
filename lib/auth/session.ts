import "server-only";
import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";

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
    .select("id, clinic_id, role, full_name")
    .eq("id", user.id)
    .single();

  return {
    db,
    user,
    profile: (data as ResolvedProfile | null) ?? null,
  };
});
