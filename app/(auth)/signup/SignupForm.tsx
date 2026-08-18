"use client";

import { useActionState, useState } from "react";
import { signUp } from "@/actions/auth";
import type { ActionResult } from "@/types";
import type { ClinicOption } from "@/actions/clinics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";

const initialState: ActionResult<null> = { data: null, error: null };

interface SignupFormProps {
  clinics: ClinicOption[];
}

export function SignupForm({ clinics }: SignupFormProps) {
  const [state, formAction, isPending] = useActionState(signUp, initialState);

  // Clinic selection is required before an account can be created.
  const [clinicId, setClinicId] = useState("");

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && (
        <div
          role="alert"
          className="rounded-lg bg-danger-bg border border-danger-border px-3.5 py-3 text-xs text-danger flex items-start gap-2"
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

      <Field label="Phone" htmlFor="phone" hint="Used to find your clinic record">
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          disabled={isPending}
          placeholder="+91 98765 43210"
        />
      </Field>

      <Field label="Password" htmlFor="password" hint="Minimum 8 characters">
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
        disabled={isPending || !clinicId}
      >
        {isPending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-xs text-text-secondary text-center">
        For clinic staff accounts, contact your administrator.
      </p>
    </form>
  );
}
