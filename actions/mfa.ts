"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { resolveSession } from "@/lib/auth/session";
import { readMfaStatus } from "@/lib/auth/mfa";
import { recordSecurityEvent } from "@/lib/security/events";
import type { ActionResult } from "@/types";

/**
 * actions/mfa.ts — two-factor enrolment and challenge.
 *
 * Everything here delegates to Supabase Auth. OraMedha stores no secret, no
 * recovery code and no factor state of its own: the TOTP secret lives in
 * Supabase's `auth.mfa_factors`, the verification happens there, and the result
 * is an assurance level on the session JWT. That is the whole reason to use the
 * platform's MFA rather than build one — a hand-rolled TOTP implementation
 * means this codebase holding a shared secret per user, and there is no version
 * of that which is better than not holding it.
 *
 * Patients are deliberately out of scope. The threat this addresses is one
 * account reading a whole clinic; a portal account reads one person's own
 * record, has no recovery desk to call, and would be locked out of their own
 * appointment history by a lost phone.
 */

const VerifySchema = z.object({
  factorId: z.string().min(1),
  challengeId: z.string().min(1),
  // TOTP codes are six digits. Constrained here so a malformed value is
  // rejected before it becomes an attempt against the rate limits.
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your app."),
});

const UnenrollSchema = z.object({ factorId: z.string().min(1) });

export type MfaFactorSummary = {
  id: string;
  friendlyName: string | null;
  createdAt: string | null;
};

export type MfaEnrolment = {
  factorId: string;
  /** otpauth:// URI as an SVG data-URL, for the authenticator app to scan. */
  qrCode: string;
  /** The same secret in text, for entering by hand when a camera is unavailable. */
  secret: string;
};

function staffOnly(role: string | undefined): boolean {
  return role === "dentist" || role === "receptionist";
}

// =============================================================================
// getMfaState — what this account currently has
// =============================================================================

export async function getMfaState(): Promise<
  ActionResult<{ enrolled: boolean; factors: MfaFactorSummary[] }>
> {
  try {
    const { profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (!staffOnly(profile.role)) return { data: null, error: "Forbidden" };

    const supabase = await createServerClient();
    const { data, error } = await supabase.auth.mfa.listFactors();

    if (error) {
      console.error("[getMfaState] listFactors:", error.message);
      return { data: null, error: "Could not load your security settings." };
    }

    // Only VERIFIED factors count. An abandoned enrolment leaves an unverified
    // row behind, and showing it as protection would be a lie about the state
    // of the account.
    const factors = (data?.totp ?? [])
      .filter((f) => f.status === "verified")
      .map((f) => ({
        id: f.id,
        friendlyName: f.friendly_name ?? null,
        createdAt: f.created_at ?? null,
      }));

    return { data: { enrolled: factors.length > 0, factors }, error: null };
  } catch (err) {
    console.error("[getMfaState] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// beginMfaEnrolment — creates a factor and returns the QR code
// =============================================================================

export async function beginMfaEnrolment(): Promise<ActionResult<MfaEnrolment>> {
  try {
    const { profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (!staffOnly(profile.role)) return { data: null, error: "Forbidden" };

    const supabase = await createServerClient();

    // Clear any unverified factor from an abandoned attempt first. Supabase
    // caps enrolled factors, and a user who starts and abandons enrolment a few
    // times would otherwise hit that cap and be unable to enrol at all — with
    // an error that says nothing about the real cause.
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const factor of existing?.totp ?? []) {
      if (factor.status !== "verified") {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator app (${new Date().toISOString().slice(0, 10)})`,
    });

    if (error || !data) {
      console.error("[beginMfaEnrolment] enroll:", error?.message);
      return { data: null, error: "Could not start setup. Please try again." };
    }

    return {
      data: {
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      },
      error: null,
    };
  } catch (err) {
    console.error("[beginMfaEnrolment] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// confirmMfaEnrolment — proves the app is set up before the factor counts
// =============================================================================

export async function confirmMfaEnrolment(
  input: unknown
): Promise<ActionResult<null>> {
  try {
    const parsed = z
      .object({ factorId: z.string().min(1), code: z.string().regex(/^\d{6}$/) })
      .safeParse(input);

    if (!parsed.success) {
      return { data: null, error: "Enter the 6-digit code from your app." };
    }

    const { profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (!staffOnly(profile.role)) return { data: null, error: "Forbidden" };

    const supabase = await createServerClient();

    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: parsed.data.factorId });

    if (challengeError || !challenge) {
      return { data: null, error: "Could not verify that code. Please try again." };
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: parsed.data.factorId,
      challengeId: challenge.id,
      code: parsed.data.code,
    });

    if (verifyError) {
      recordSecurityEvent("MFA_CHALLENGE_FAILED", {
        userId: profile.id,
        clinicId: profile.clinic_id,
        role: profile.role,
        surface: "enrolment",
      });
      return { data: null, error: "That code wasn't right. Check the app and try again." };
    }

    recordSecurityEvent("MFA_ENROLLED", {
      userId: profile.id,
      clinicId: profile.clinic_id,
      role: profile.role,
    });

    revalidatePath("/dentist/settings");
    return { data: null, error: null };
  } catch (err) {
    console.error("[confirmMfaEnrolment] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// startMfaChallenge / completeMfaChallenge — the sign-in second step
// =============================================================================

export async function startMfaChallenge(): Promise<
  ActionResult<{ factorId: string; challengeId: string }>
> {
  try {
    const supabase = await createServerClient();

    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      return { data: null, error: "Could not start verification." };
    }

    const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
    if (!factor) {
      // Nothing to challenge. The caller sends the user on rather than showing
      // a code box that could never be satisfied.
      return { data: null, error: "No authenticator is set up on this account." };
    }

    const { data: challenge, error } = await supabase.auth.mfa.challenge({
      factorId: factor.id,
    });

    if (error || !challenge) {
      return { data: null, error: "Could not start verification." };
    }

    return { data: { factorId: factor.id, challengeId: challenge.id }, error: null };
  } catch (err) {
    console.error("[startMfaChallenge] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

export async function completeMfaChallenge(
  input: unknown
): Promise<ActionResult<null>> {
  try {
    const parsed = VerifySchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message ?? "Invalid code." };
    }

    const supabase = await createServerClient();

    const { error } = await supabase.auth.mfa.verify({
      factorId: parsed.data.factorId,
      challengeId: parsed.data.challengeId,
      code: parsed.data.code,
    });

    if (error) {
      // The user id is not resolved here on purpose: this runs before the
      // session reaches aal2, and the account is identified well enough by the
      // session Supabase is validating against.
      recordSecurityEvent("MFA_CHALLENGE_FAILED", { surface: "sign-in" });
      return { data: null, error: "That code wasn't right. Please try again." };
    }

    return { data: null, error: null };
  } catch (err) {
    console.error("[completeMfaChallenge] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// removeMfaFactor
// =============================================================================

export async function removeMfaFactor(input: unknown): Promise<ActionResult<null>> {
  try {
    const parsed = UnenrollSchema.safeParse(input);
    if (!parsed.success) return { data: null, error: "Invalid request." };

    const { profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (!staffOnly(profile.role)) return { data: null, error: "Forbidden" };

    const supabase = await createServerClient();

    // Removing a factor is a security DOWNGRADE, so the session must already
    // have satisfied it. Otherwise someone who stole a session cookie at aal1
    // could strip the protection they could not pass.
    const status = await readMfaStatus(supabase);
    if (status.enrolled && status.current !== "aal2") {
      return {
        data: null,
        error: "Verify with your authenticator app before removing it.",
      };
    }

    const { error } = await supabase.auth.mfa.unenroll({
      factorId: parsed.data.factorId,
    });

    if (error) {
      console.error("[removeMfaFactor] unenroll:", error.message);
      return { data: null, error: "Could not remove that authenticator." };
    }

    recordSecurityEvent("MFA_UNENROLLED", {
      userId: profile.id,
      clinicId: profile.clinic_id,
      role: profile.role,
    });

    revalidatePath("/dentist/settings");
    return { data: null, error: null };
  } catch (err) {
    console.error("[removeMfaFactor] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
