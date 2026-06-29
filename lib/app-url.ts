import { headers } from "next/headers";

/**
 * getAppOrigin
 *
 * Resolves the absolute origin (scheme + host) of the running application at
 * REQUEST TIME — e.g. "http://localhost:3000" in local dev and
 * "https://dent-grow.vercel.app" in production.
 *
 * Why request-derived instead of process.env.NEXT_PUBLIC_APP_URL:
 *   `NEXT_PUBLIC_*` variables are inlined into the bundle at BUILD time, so the
 *   value present during `next build` (historically http://localhost:3000) gets
 *   hard-coded into the compiled output. That is exactly how localhost URLs
 *   leaked into production password-reset emails. Reading the incoming request
 *   headers avoids the problem entirely: the URL always matches the domain the
 *   user actually used.
 *
 * Resolution order:
 *   1. Forwarded host headers set by the platform proxy (Vercel) / dev server.
 *   2. Explicit NEXT_PUBLIC_APP_URL override, if set (runtime fallback).
 *   3. http://localhost:3000 as a final development fallback.
 *
 * Must be called from a Server Action, Route Handler, or Server Component
 * (anywhere next/headers is available).
 */
export async function getAppOrigin(): Promise<string> {
  const h = await headers();

  // Behind the Vercel proxy the public host is in x-forwarded-host; locally and
  // elsewhere it is the standard host header.
  const host = h.get("x-forwarded-host") ?? h.get("host");

  if (host) {
    const proto =
      h.get("x-forwarded-proto") ??
      (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`;
  }

  // Fallbacks — only reached if no request headers are available.
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");

  return "http://localhost:3000";
}

/**
 * getAppUrl — convenience wrapper that appends a relative path to the resolved
 * origin. The path should start with "/".
 */
export async function getAppUrl(path: string): Promise<string> {
  const origin = await getAppOrigin();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${suffix}`;
}
