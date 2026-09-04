"use client";

import { useActionState } from "react";
import { signInStaff } from "@/actions/auth";
import type { ActionResult } from "@/types";
import {
  AuthAlert,
  AuthField,
  AuthSubmit,
  PasswordField,
  AuthLink,
} from "@/components/auth/AuthFields";

const initialState: ActionResult<null> = { data: null, error: null };

/**
 * StaffLoginForm — /login
 *
 * Two fields. No clinic dropdown, no role picker: the server already knows
 * which clinic this account belongs to and which portal its role entitles it
 * to, so asking would be asking the user to repeat something the database can
 * answer with certainty — and something a browser must never be trusted for.
 *
 * "Forgot password?" is here now. It deliberately was not: self-service reset
 * used to be patient-only, on the reasoning that staff credentials are issued
 * and rotated by the clinic, and a link that silently did nothing for a dentist
 * would be worse than none. Reset covers staff and admin as of
 * actions/auth.ts:resolveResetAudience, so the link does something, and a
 * locked-out dentist no longer needs someone with database access to get back
 * in.
 */
export function StaffLoginForm() {
  const [state, formAction, isPending] = useActionState(signInStaff, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
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
        placeholder="you@clinic.com"
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
