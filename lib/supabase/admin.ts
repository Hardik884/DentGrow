import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * createAdminClient
 *
 * Returns a Supabase client authenticated with the SERVICE_ROLE key.
 * This client bypasses Row Level Security entirely — use only in
 * trusted server-side contexts (Server Actions, Route Handlers).
 *
 * Required for operations that no authenticated user role can perform:
 *   - Inserting a profile row during patient portal linking (profiles has
 *     no client-facing INSERT RLS policy — clinic_id must be verified
 *     server-side before the row is written).
 *   - Any other privileged write that must bypass RLS.
 *
 * NEVER expose this client to the browser.
 * NEVER use NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY — it must not be public.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. " +
        "These are required for the admin Supabase client."
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      // Disable auto session management — this client acts as the service role,
      // not as any individual user. persistSession and autoRefreshToken are
      // irrelevant and should be off to avoid unintended side effects.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
