import "server-only";

/**
 * lib/auth/mfa.ts
 *
 * Where two-factor authentication is required, and where it is not.
 *
 * THE PROBLEM
 *   A single password protected accounts that can read an entire clinic's
 *   patient records, prescriptions and financial history. Not one person's
 *   data — the whole tenant. TOTP was disabled outright in config.toml, so
 *   there was not even an option to turn on.
 *
 * PROGRESSIVE, IN THREE STAGES, AND THE ORDER MATTERS
 *
 *   1. AVAILABLE. Enrolment is enabled and any staff account can add a factor
 *      from settings. Enabling enrolment cannot lock anyone out: Supabase only
 *      demands a second factor from an account that has actually enrolled one.
 *
 *   2. ENFORCED FOR THE ENROLLED. Anyone who has enrolled must use it — that
 *      is automatic, and it is the property that makes stage 1 worth anything.
 *      A factor nobody is asked for is decoration.
 *
 *   3. REQUIRED FOR ADMINS. Gated behind REQUIRE_ADMIN_MFA, off by default.
 *
 *   Stage 3 is a switch and not a constant for one reason: turning it on before
 *   the platform admin has enrolled locks that account out of the console it
 *   would use to fix the problem. The safe sequence is enrol, verify, then set
 *   the flag — and a flag is what lets that sequence exist.
 *
 *   → REQUIRES MANUAL CONFIGURATION. See docs/SECURITY.md.
 *
 * WHY NOT REQUIRE IT OF EVERY DENTIST TODAY
 *   A receptionist locked out at 9am with a queue forming is a clinical
 *   availability problem, not an inconvenience, and OraMedha has no account
 *   recovery desk to call. Requiring MFA of every clinic user is the right
 *   destination and it needs a recovery story first — that is a product
 *   decision with an operational dependency, and pretending otherwise by
 *   flipping a constant would create outages nobody could resolve.
 */

/** Supabase's assurance levels. aal2 means a second factor was verified this session. */
export type AssuranceLevel = "aal1" | "aal2";

export type MfaStatus = {
  /** Level the session currently holds. */
  current: AssuranceLevel | null;
  /**
   * Level this account SHOULD hold. Supabase returns 'aal2' when the user has a
   * verified factor, so this is how "has enrolled" is known without listing
   * factors.
   */
  next: AssuranceLevel | null;
  /** True when a factor exists but has not been satisfied in this session. */
  challengeRequired: boolean;
  /** True when this account has at least one verified factor. */
  enrolled: boolean;
};

/** Is admin MFA mandatory in this deployment? Off unless explicitly enabled. */
export function adminMfaRequired(): boolean {
  return process.env.REQUIRE_ADMIN_MFA === "true";
}

/**
 * Reads the session's assurance level.
 *
 * Returns a null/false status rather than throwing when the call fails — an MFA
 * check that errors must not become a sign-in outage, and every caller treats
 * "unknown" as "do not challenge", which is the same position the product was
 * in before MFA existed.
 */
export async function readMfaStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<MfaStatus> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (error || !data) {
      return { current: null, next: null, challengeRequired: false, enrolled: false };
    }

    const current = (data.currentLevel ?? null) as AssuranceLevel | null;
    const next = (data.nextLevel ?? null) as AssuranceLevel | null;

    // nextLevel is 'aal2' exactly when a verified factor exists.
    const enrolled = next === "aal2";

    return {
      current,
      next,
      enrolled,
      challengeRequired: enrolled && current !== "aal2",
    };
  } catch {
    return { current: null, next: null, challengeRequired: false, enrolled: false };
  }
}

/**
 * Whether this request should be sent to the challenge screen.
 *
 * Two independent reasons, and they are different situations:
 *   - the account HAS a factor and has not used it this session (always);
 *   - the account is an admin, admin MFA is required, and no factor exists at
 *     all — in which case the destination is enrolment, not a code entry.
 */
export function mfaGateFor(
  status: MfaStatus,
  options: { isAdmin: boolean }
): "none" | "challenge" | "enrol" {
  if (status.challengeRequired) return "challenge";
  if (options.isAdmin && adminMfaRequired() && !status.enrolled) return "enrol";
  return "none";
}
