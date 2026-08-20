"use client";

import { useActionState, useState } from "react";
import { signUpPatient } from "@/actions/auth";
import type { ActionResult } from "@/types";
import type { ClinicOption } from "@/actions/clinics";
import { Select } from "@/components/ui/select";
import {
  AuthAlert,
  AuthField,
  AuthSubmit,
  PasswordField,
} from "@/components/auth/AuthFields";

const initialState: ActionResult<null> = { data: null, error: null };

/**
 * PatientSignupForm — /patient/signup
 *
 * The only form in DentGrow that asks for a clinic, and the reason it does is
 * simple: a brand-new patient has no record for the server to read a clinic
 * from. So the choice is presented as what it actually is — "which clinic do
 * you attend?" — rather than as a generic filter, and it is given its own
 * bordered block at the top of the form so it reads as a decision rather than
 * one more input to tab past.
 *
 * The chosen id is still verified server-side against the clinics table before
 * it scopes anything (actions/auth.ts:signUpPatient). Nothing here is trusted.
 */
export function PatientSignupForm({ clinics }: { clinics: ClinicOption[] }) {
  const [state, formAction, isPending] = useActionState(signUpPatient, initialState);
  const [clinicId, setClinicId] = useState("");

  const selected = clinics.find((c) => c.id === clinicId);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && <AuthAlert>{state.error}</AuthAlert>}

      {/* Clinic — deliberately set apart from the credential fields. */}
      <fieldset className="rounded-xl border border-accent-border bg-accent-subtle-bg p-4">
        <legend className="px-1 text-[13px] font-semibold text-text-strong">
          Which clinic do you attend?
        </legend>

        <p className="mb-3 text-xs leading-relaxed text-text-body">
          Your account will be registered with this clinic, and only this clinic
          will see your records.
        </p>

        <Select
          id="clinic_id"
          name="clinic_id"
          aria-label="Clinic"
          required
          disabled={isPending}
          value={clinicId}
          onChange={(e) => setClinicId(e.target.value)}
          className="h-11 bg-surface text-[15px]"
        >
          <option value="" disabled>
            Select your clinic…
          </option>
          {clinics.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        {selected?.dentist_name && (
          <p className="mt-2 text-xs text-text-body">
            Cared for by {selected.dentist_name}.
          </p>
        )}
      </fieldset>

      <AuthField
        label="Full name"
        id="full_name"
        name="full_name"
        type="text"
        autoComplete="name"
        required
        disabled={isPending}
        placeholder="Your name"
      />

      <AuthField
        label="Phone number"
        id="phone"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        disabled={isPending}
        placeholder="+91 98765 43210"
        hint="We use this to find the record your clinic already has for you."
      />

      <AuthField
        label="Email address"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        disabled={isPending}
        placeholder="you@example.com"
      />

      <PasswordField
        label="Password"
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
        placeholder="Re-enter your password"
      />

      <AuthSubmit
        isPending={isPending}
        idleLabel="Create account"
        pendingLabel="Creating your account…"
        disabled={!clinicId}
      />

      <p className="text-center text-xs leading-relaxed text-text-body">
        Clinic staff accounts are created by your clinic — this form is for
        patients only.
      </p>
    </form>
  );
}
