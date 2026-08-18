"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updatePassword } from "@/actions/auth";
import type { ActionResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

const initialState: ActionResult<{ updated: true }> = { data: null, error: null };

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
 * On success it toasts and redirects to /login?reset=1, where the patient signs
 * in with the new password. The button is disabled while pending to prevent
 * duplicate submissions.
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
  const handled = useRef<ActionResult<{ updated: true }> | null>(null);
  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;

    if (state.data?.updated) {
      toast.success("Password updated successfully.");
      router.push("/login?reset=1");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  const error = clientError ?? state.error;

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-4" noValidate>
      {linkError && !state.data?.updated && (
        <div
          role="alert"
          className="rounded-lg bg-danger-bg border border-danger-border px-3.5 py-3 text-xs text-danger flex items-start gap-2"
        >
          <svg className="h-4 w-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          This reset link is invalid or has expired. Please request a new one.
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg bg-danger-bg border border-danger-border px-3.5 py-3 text-xs text-danger flex items-start gap-2"
        >
          <svg className="h-4 w-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      <Field label="New password" htmlFor="password" hint="Minimum 8 characters">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          disabled={isPending}
          placeholder="Min. 8 characters"
        />
      </Field>

      <Field label="Confirm password" htmlFor="confirmPassword">
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          disabled={isPending}
          placeholder="••••••••"
        />
      </Field>

      <Button
        type="submit"
        className="w-full mt-2"
        isLoading={isPending}
        size="md"
        disabled={isPending}
      >
        {isPending ? "Updating…" : "Reset password"}
      </Button>
    </form>
  );
}
