import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 *
 * Verification endpoint for Supabase Auth recovery / confirmation links.
 *
 * It accepts BOTH link styles Supabase can produce, so the flow works
 * regardless of how the project's email template is configured:
 *
 *   1. PKCE code flow (default template, `{{ .ConfirmationURL }}`):
 *        /auth/callback?code=<code>&next=/reset-password
 *      → exchangeCodeForSession(code)
 *
 *   2. Token-hash / OTP flow (template using `{{ .TokenHash }}`):
 *        /auth/callback?token_hash=<hash>&type=recovery&next=/reset-password
 *      → verifyOtp({ token_hash, type })
 *      (works cross-device — no PKCE verifier cookie required)
 *
 * On success a short-lived recovery session is written to cookies and the user
 * is forwarded to `next` (/reset-password), where the password update is
 * authorised. This route is allow-listed in middleware so it is reachable
 * without an existing session.
 *
 * NOTE: For the link to reach this route, the URL must be registered in the
 * Supabase dashboard under Authentication → URL Configuration → Redirect URLs
 * (e.g. http://localhost:3000/**). Otherwise Supabase ignores redirect_to and
 * falls back to the Site URL.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/reset-password";

  // Only allow internal, relative redirects to prevent open-redirect abuse.
  const safeNext = next.startsWith("/") ? next : "/reset-password";

  const supabase = await createServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
    console.error("[auth/callback] code exchange failed:", error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
    console.error("[auth/callback] OTP verification failed:", error.message);
  }

  // No usable token, or verification failed — send to the reset page with an
  // error flag so the user gets a clear "invalid or expired link" message.
  return NextResponse.redirect(`${origin}/reset-password?error=link`);
}
