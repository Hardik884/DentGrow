"use client";

import { useActionState } from "react";
import { signInPatient } from "@/actions/auth";
import type { ActionResult } from "@/types";
import {
  AuthAlert,
  AuthField,
  AuthLink,
  AuthNotice,
  AuthSubmit,
  PasswordField,
} from "@/components/auth/AuthFields";

const initialState: ActionResult<null> = { data: null, error: null };

/**
 * PatientLoginForm — /patient/login
 *
 * Email and password, nothing else. An existing patient's clinic is already on
 * their patient record, so asking them to pick it would be asking them to
 * remember something the server can look up — and getting it wrong would lock
 * them out of their own history. Clinic selection appears exactly once in the
 * product, on the signup form, for people who don't have a record yet.
 *
 * "Forgot password?" lives here, and now on the staff and admin forms too:
 * self-service reset used to be patient-only and covers every audience as of
 * actions/auth.ts:resolveResetAudience. All three link to the same
 * /forgot-password page, which cannot tell the audiences apart and does not
 * try to.
 */
export function PatientLoginForm({ resetSuccess }: { resetSuccess?: boolean }) {
  const [state, formAction, isPending] = useActionState(signInPatient, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {resetSuccess && (
        <AuthNotice>Password updated. Sign in with your new password.</AuthNotice>
      )}

      {state.error && <AuthAlert>{state.error}</AuthAlert>}

      <AuthField
        label="Email address"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        autoFocus
        required
        disabled={isPending}
        placeholder="you@example.com"
      />

      <PasswordField
        label="Password"
        id="password"
        name="password"
        autoComplete="current-password"
        required
        disabled={isPending}
        placeholder="Enter your password"
        action={
          <AuthLink href="/forgot-password" className="text-[13px] font-normal">
            Forgot password?
          </AuthLink>
        }
      />

      <AuthSubmit
        isPending={isPending}
        idleLabel="Sign in"
        pendingLabel="Signing in…"
      />
    </form>
  );
}
