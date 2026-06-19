import { createServerClient as createSupabaseServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";

/**
 * createServerClient
 *
 * Creates a Supabase client for use in:
 * - Server Components
 * - Server Actions (actions/*.ts)
 * - Route Handlers (app/api/*)
 *
 * Reads and writes session cookies via Next.js cookies() API.
 * Typed with the generated Database type for full type safety.
 *
 * NEVER import this in files with 'use client'.
 * NEVER use for Realtime subscriptions — use lib/supabase/client.ts instead.
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component — cookies cannot be set.
            // Session refresh happens in middleware instead.
          }
        },
      },
    }
  );
}
