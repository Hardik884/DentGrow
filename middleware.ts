import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  buildCsp,
  cspHeaderName,
  generateNonce,
} from "@/lib/security/headers";

/**
 * Next.js Middleware — runs on every matched request.
 *
 * Responsibilities:
 * 1. Refresh the Supabase session cookie (updateSession).
 * 2. Redirect unauthenticated users to the sign-in page for the area they
 *    asked for (/login, /patient/login or /admin/login).
 * 3. Enforce audience-based route access:
 *    - /admin/*         → requires profiles.is_admin
 *    - /dentist/*       → requires role === 'dentist'
 *    - /receptionist/*  → requires role === 'receptionist'
 *    - /portal/*        → patients only;
 *                         redirects to /portal/setup if no portal link exists
 * 4. Redirect already-authenticated users away from every sign-in page.
 * 5. Issue a per-request CSP nonce and attach the Content-Security-Policy.
 *
 * Security note: the ROUTING part of this middleware is a UX redirect layer
 * only. RLS policies in Supabase are the authoritative security boundary.
 * The CSP is a real control, but a browser-side one: it limits the damage a
 * successfully injected script can do, it does not decide who may read what.
 */
export async function middleware(request: NextRequest) {
  // One nonce per request. It travels two ways, and both are needed:
  //   - as a REQUEST header, so the root layout can stamp the inline theme
  //     script with it, and so Next.js stamps its own bootstrap scripts;
  //   - inside the CSP on the RESPONSE, which is what the browser enforces.
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  const response = await updateSession(request, {
    "x-nonce": nonce,
    // Next.js looks for the nonce on this request header to nonce the scripts
    // it generates. It is always the enforcing header name, regardless of the
    // mode used on the response — otherwise report-only mode would report every
    // framework script and the reports would be unreadable.
    "content-security-policy": csp,
  });

  response.headers.set(cspHeaderName(), csp);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - api           (machine-to-machine routes — see below)
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico   (favicon)
     * - public folder files
     *
     * `/api` is excluded because this middleware redirects any unauthenticated
     * request to /login, and an API caller has no session to redirect. pg_cron
     * calling /api/cron/* over pg_net was answered with a 307 to an HTML login
     * page, so both scheduled jobs silently did nothing — the request never
     * reached the route handler and the redirect looked like a success to the
     * caller. n8n's webhook had the same problem.
     *
     * These routes authenticate themselves and are stricter than the redirect
     * ever was: the cron endpoints require a bearer token compared in constant
     * time and refuse to run at all when CRON_SECRET is unset; the webhook
     * validates a shared secret. None of them read the session cookie, so there
     * is nothing for updateSession to do on their behalf.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
