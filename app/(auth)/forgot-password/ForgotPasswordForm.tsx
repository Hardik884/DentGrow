"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { requestPasswordReset } from "@/actions/auth";
import type { ActionResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

const initialState: ActionResult<{ sent: true }> = { data: null, error: null };

/**
 * ForgotPasswordForm
 *
 * Patient-facing "request a reset link" form. Submits to the
 * requestPasswordReset Server Action, which only emails patient accounts and
 * always returns a generic success (enumeration-safe).
 *
 * On success the form is replaced by a generic confirmation message; an error
 * toast surfaces unexpected/validation failures. The submit button is disabled
 * while pending to prevent duplicate submissions.
 */
export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordReset,
    initialState
  );

  // Fire toasts once per state transition.
  const handled = useRef<ActionResult<{ sent: true }> | null>(null);
  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;

    if (state.data?.sent) {
      toast.success("If an account exists, a reset link is on its way.");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  // Success view — replaces the form so the action can't be re-submitted.
  if (state.data?.sent) {
    return (
      <div
        role="status"
        className="rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] px-3.5 py-3 text-sm text-[#166534] flex items-start gap-2"
      >
        <svg className="h-4 w-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
          <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.555a1 1 0 0 1-1.42.001L3.29 10.36a1 1 0 1 1 1.42-1.41l3.29 3.31 6.79-6.84a1 1 0 0 1 1.414-.13Z" clipRule="evenodd" />
        </svg>
        If an account exists with this email, a password reset link has been sent.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && (
        <div
          role="alert"
          className="rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-3 text-xs text-[#DC2626] flex items-start gap-2"
        >
          <svg className="h-4 w-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          {state.error}
        </div>
      )}

      <Field label="Email address" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          placeholder="you@example.com"
        />
      </Field>

      <Button
        type="submit"
        className="w-full mt-2"
        isLoading={isPending}
        size="md"
        disabled={isPending}
      >
        {isPending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
