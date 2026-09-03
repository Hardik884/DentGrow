import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database.types";

/**
 * lib/supabase/middleware-client.ts
 *
 * Builds the Supabase client that `updateSession` uses, together with the
 * response that carries any refreshed session cookies.
 *
 * Why this is a separate module: `updateSession` runs on every request in the
 * app, so its cost is worth testing and measuring. Pulling client construction
 * behind a first-party module gives specs a seam they can substitute — mocking
 * `@supabase/ssr` directly is unreliable, because the package ships both CJS
 * and ESM builds and a spec's import can resolve to a different one than
 * `updateSession`'s, leaving the real client in place.
 *
 * Behaviour is unchanged: same cookie plumbing, same client options.
 *
 * `extraRequestHeaders` lets middleware add headers the DOWNSTREAM render can
 * read via next/headers — the CSP nonce is passed this way, because a response
 * header is not visible to a Server Component. They are merged fresh on every
 * `NextResponse.next()` (including the one Supabase triggers when it rotates
 * session cookies) so a refreshed `cookie` header is never lost to a stale
 * snapshot.
 */

export type MiddlewareClient = {
  supabase: ReturnType<typeof createServerClient>;
  /**
   * The response to return from middleware. Read it AFTER awaiting any auth
   * call — `setAll` replaces it when Supabase rotates the session cookies.
   */
  response: () => NextResponse;
};

export function createMiddlewareClient(
  request: NextRequest,
  extraRequestHeaders?: Record<string, string>
): MiddlewareClient {
  const withExtraHeaders = () => {
    if (!extraRequestHeaders) return { request };
    const headers = new Headers(request.headers);
    for (const [name, value] of Object.entries(extraRequestHeaders)) {
      headers.set(name, value);
    }
    return { request: { headers } };
  };

  let response = NextResponse.next(withExtraHeaders());

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next(withExtraHeaders());
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  return { supabase, response: () => response };
}
