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
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico   (favicon)
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
