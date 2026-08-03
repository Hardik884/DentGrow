import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js Middleware — runs on every matched request.
 *
 * Responsibilities:
 * 1. Refresh the Supabase session cookie (updateSession).
 * 2. Redirect unauthenticated users to /login.
 * 3. Enforce role-based route access:
 *    - /dentist/*       → requires role === 'dentist'
 *    - /receptionist/*  → requires role === 'receptionist'
 *    - /portal/*        → requires any authenticated user;
 *                         redirects to /portal/setup if no portal link exists
 * 4. Redirect already-authenticated staff away from /login and /signup.
 *
 * Security note: middleware is a UX redirect layer only.
 * RLS policies in Supabase are the authoritative security boundary.
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request);
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
