"use client";

import { useActionState, useState } from "react";
import { signIn } from "@/actions/auth";
import type { ActionResult } from "@/types";
import type { ClinicOption } from "@/actions/clinics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";

const initialState: ActionResult<null> = { data: null, error: null };

interface LoginFormProps {
  clinics: ClinicOption[];
  resetSuccess?: boolean;
}

// Pilot convenience: pre-select this clinic by name when it is present in the
// dynamically loaded directory. This is a UI default only — the dropdown stays
// fully editable and any clinic (current or future) can still be chosen.
const DEFAULT_CLINIC_NAME = "Dr. Liying's Dental Care";

export function LoginForm({ clinics, resetSuccess }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(signIn, initialState);

  // Clinic selection is required before sign-in is allowed.
  // If the default pilot clinic exists in the loaded directory, pre-select it;
  // otherwise gracefully fall back to no selection.
  const [clinicId, setClinicId] = useState(
    () => clinics.find((c) => c.name === DEFAULT_CLINIC_NAME)?.id ?? ""
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {/* Success banner — shown after a completed password reset */}
      {resetSuccess && (
        <div
          role="status"
          className="rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] px-3.5 py-3 text-xs text-[#16A34A] flex items-start gap-2"
        >
          <svg className="h-4 w-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
            <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.555a1 1 0 0 1-1.42.001L3.29 10.36a1 1 0 1 1 1.42-1.41l3.29 3.31 6.79-6.84a1 1 0 0 1 1.414-.13Z" clipRule="evenodd" />
          </svg>
          Password updated successfully. Please sign in.
        </div>
      )}

      {/* Error banner */}
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

      <Field label="Clinic" htmlFor="clinic_id" required>
        <Select
          id="clinic_id"
          name="clinic_id"
          required
          disabled={isPending}
          value={clinicId}
          onChange={(e) => setClinicId(e.target.value)}
        >
          <option value="" disabled>
            Select a clinic…
          </option>
          {clinics.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

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

      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
          placeholder="••••••••"
        />
        <div className="flex justify-end pt-0.5">
          <a
            href="/forgot-password"
            className="text-xs text-[#71717A] hover:text-[#09090B] hover:underline underline-offset-4"
          >
            Forgot password?
          </a>
        </div>
      </Field>

      <Button
        type="submit"
        className="w-full mt-2"
        isLoading={isPending}
        size="md"
        disabled={isPending || !clinicId}
      >
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
