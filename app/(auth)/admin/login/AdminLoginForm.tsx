"use client";

import { useActionState } from "react";
import { signInAdmin } from "@/actions/auth";
import type { ActionResult } from "@/types";
import {
  AuthAlert,
  AuthField,
  AuthSubmit,
  PasswordField,
} from "@/components/auth/AuthFields";

const initialState: ActionResult<null> = { data: null, error: null };

/**
 * AdminLoginForm — /admin/login
 *
 * Identical mechanics to the other two forms; the difference is entirely on the
 * server. signInAdmin checks the profile's admin flag after the password check
 * and signs any non-admin straight back out, so submitting valid dentist or
 * receptionist credentials here gets you nothing but the message below.
 *
 * There is no "create account", no "forgot password" and no patient link — an
 * admin credential is never self-service.
 */
export function AdminLoginForm() {
  const [state, formAction, isPending] = useActionState(signInAdmin, initialState);

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
        placeholder="admin@dentgrow.local"
      />

      <PasswordField
        label="Password"
        id="password"
        name="password"
        autoComplete="current-password"
        required
        disabled={isPending}
        placeholder="Enter your password"
      />

      <AuthSubmit
        isPending={isPending}
        idleLabel="Continue"
        pendingLabel="Verifying…"
      />
    </form>
  );
}
