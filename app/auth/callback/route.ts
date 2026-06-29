import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 *
 * Code-exchange endpoint for Supabase Auth recovery/confirmation links.
 *
 * Supabase uses the PKCE flow by default with @supabase/ssr: the email link
 * lands here with a `?code=` parameter. We exchange that code for a session
 * (stored in cookies by createServerClient) and then forward the user to the
 * `next` destination — for password reset that is /reset-password, where the
 * short-lived recovery session authorises the password update.
 *
 * This route is allow-listed in middleware so it is reachable without an
 * existing session.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Only allow internal, relative redirects to prevent open-redirect abuse.
  const safeNext = next.startsWith("/") ? next : "/";

  if (code) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
    console.error("[auth/callback] exchange failed:", error.message);
  }

  // No code or exchange failed — send to the reset page with an error flag so
  // the user gets a clear "invalid or expired link" message.
  return NextResponse.redirect(`${origin}/reset-password?error=link`);
}
