"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updatePassword } from "@/actions/auth";
import type { ActionResult } from "@/types";
import { AuthAlert, AuthSubmit, PasswordField } from "@/components/auth/AuthFields";

const initialState: ActionResult<{ updated: true; signInPath: string }> = {
  data: null,
  error: null,
};

interface ResetPasswordFormProps {
  /** True when /auth/callback could not establish a recovery session. */
  linkError?: boolean;
}

/**
 * ResetPasswordForm
 *
 * Runs inside the short-lived recovery session set by /auth/callback. Collects
 * a new password + confirmation, validates client-side for instant feedback,
 * and submits to the updatePassword Server Action (which re-validates against
 * the existing policy and updates the Supabase account).
 *
 * On success it toasts and redirects to the sign-in door for THIS account's
 * audience — the Server Action resolves that path from the profile and returns
 * it, because the three doors reject each other's accounts and a dentist sent
 * to /patient/login would be bounced straight back out. The button is disabled
 * while pending to prevent duplicate submissions.
 */
export function ResetPasswordForm({ linkError }: ResetPasswordFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(updatePassword, initialState);

  // Lightweight client-side validation for immediate feedback.
  const [clientError, setClientError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const password = (form.elements.namedItem("password") as HTMLInputElement)?.value ?? "";
    const confirmPassword =
      (form.elements.namedItem("confirmPassword") as HTMLInputElement)?.value ?? "";

    if (password.length < 8) {
      e.preventDefault();
      setClientError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      e.preventDefault();
      setClientError("Passwords do not match.");
      return;
    }
    setClientError(null);
  }

  // Fire toasts / redirect once per state transition.
  const handled = useRef<ActionResult<{ updated: true; signInPath: string }> | null>(null);
  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;

    if (state.data?.updated) {
      toast.success("Password updated successfully.");
      // Server-resolved: never a path the browser chose for itself.
      router.push(`${state.data.signInPath}?reset=1`);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  const error = clientError ?? state.error;

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-5" noValidate>
      {linkError && !state.data?.updated && (
        <AuthAlert>
          This reset link is invalid or has expired. Please request a new one.
        </AuthAlert>
      )}

      {error && <AuthAlert>{error}</AuthAlert>}

      <PasswordField
        label="New password"
        id="password"
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
        disabled={isPending}
        placeholder="At least 8 characters"
        hint="Use at least 8 characters."
      />

      <PasswordField
        label="Confirm password"
        id="confirmPassword"
        name="confirmPassword"
        autoComplete="new-password"
        required
        minLength={8}
        disabled={isPending}
        placeholder="Re-enter your new password"
      />

      <AuthSubmit
        isPending={isPending}
        idleLabel="Reset password"
        pendingLabel="Updating…"
      />
    </form>
  );
}
