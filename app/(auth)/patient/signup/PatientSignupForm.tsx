"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  requestActivation,
  verifyActivation,
  completeActivation,
} from "@/actions/portal-activation";
import type { ActionResult } from "@/types";
import {
  AuthAlert,
  AuthField,
  AuthNotice,
  AuthSubmit,
  PasswordField,
} from "@/components/auth/AuthFields";

/**
 * PatientSignupForm — portal activation, in three steps on one page.
 *
 * THERE IS NO CLINIC PICKER, AND THAT IS THE POINT
 *   This form used to ask which clinic you attend. It was the only form in
 *   OraMedha that did, and the justification was that a brand-new patient has
 *   no record for the server to read a clinic from.
 *
 *   That justification no longer holds: a patient CANNOT self-register at all
 *   now. The clinic creates the record and puts an address on it, so by the
 *   time anyone reaches this page there is already a row that knows which
 *   clinic they belong to. Asking would be asking them to repeat something the
 *   server knows better — and inviting them to get it wrong.
 *
 * WHY THE STEPS ARE SEPARATE STATE, NOT SEPARATE ROUTES
 *   The email typed in step 1 has to survive into step 2, and a route change
 *   would mean carrying it in a cookie or a query string. Keeping all three on
 *   one page keeps it in memory and out of the URL — a code is being sent to
 *   that address, and an address sitting in a browser history entry is a small
 *   leak for no benefit.
 *
 * The generic step-1 response is deliberate: it looks the same whether or not
 * the address belongs to a patient, so this form cannot be used to discover who
 * a clinic's patients are.
 */

type Step = "email" | "code" | "password";

const requestInit: ActionResult<{ sent: true; email: string }> = { data: null, error: null };
const verifyInit: ActionResult<{ verified: true }> = { data: null, error: null };
const completeInit: ActionResult<{ activated: true }> = { data: null, error: null };

export function PatientSignupForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");

  const [reqState, requestAction, reqPending] = useActionState(requestActivation, requestInit);
  const [verState, verifyAction, verPending] = useActionState(verifyActivation, verifyInit);
  const [cmpState, completeAction, cmpPending] = useActionState(completeActivation, completeInit);

  // ── Step transitions, each fired once per state change ────────────────────
  const reqSeen = useRef<typeof reqState | null>(null);
  useEffect(() => {
    if (reqSeen.current === reqState) return;
    reqSeen.current = reqState;
    if (reqState.data?.sent) {
      setEmail(reqState.data.email);
      setStep("code");
    }
  }, [reqState]);

  const verSeen = useRef<typeof verState | null>(null);
  useEffect(() => {
    if (verSeen.current === verState) return;
    verSeen.current = verState;
    if (verState.data?.verified) setStep("password");
  }, [verState]);

  const cmpSeen = useRef<typeof cmpState | null>(null);
  useEffect(() => {
    if (cmpSeen.current === cmpState) return;
    cmpSeen.current = cmpState;
    if (cmpState.data?.activated) {
      // Straight into the portal, not back to the sign-in door.
      //
      // The session that verified the emailed code is a real authenticated
      // session, and step 3 has just set a password on it. Signing them out to
      // make them type that password immediately would be friction with nothing
      // behind it — unlike the password RESET flow, which signs out on purpose
      // because a changed password should invalidate other sessions.
      //
      // "Normal login is email + password" is still true: nothing here runs
      // again, and the next visit is an ordinary sign-in.
      toast.success("Your account is ready.");
      router.push("/portal");
    }
  }, [cmpState, router]);

  // ── Step 1 — the address the clinic holds ─────────────────────────────────
  if (step === "email") {
    return (
      <form action={requestAction} className="space-y-5" noValidate>
        {reqState.error && <AuthAlert>{reqState.error}</AuthAlert>}

        <AuthField
          label="Email address"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          disabled={reqPending}
          placeholder="you@example.com"
          hint="Use the email address your clinic has on file for you."
        />

        <AuthSubmit
          isPending={reqPending}
          idleLabel="Send code"
          pendingLabel="Sending…"
        />
      </form>
    );
  }

  // ── Step 2 — prove control of the inbox ───────────────────────────────────
  if (step === "code") {
    return (
      <form action={verifyAction} className="space-y-5" noValidate>
        <AuthNotice>
          If that address is registered with a clinic, we&apos;ve sent a verification code
          to it. Enter it below.
        </AuthNotice>

        {verState.error && <AuthAlert>{verState.error}</AuthAlert>}

        {/* Carried forward from step 1 rather than retyped — the code was sent
            to this exact address and the server verifies against it. */}
        <input type="hidden" name="email" value={email} />

        {/*
          No length is stated anywhere on this step, and that is deliberate.
          The code's length is a Supabase PROJECT setting (mailer_otp_length),
          not a property of this flow — production issues 8 digits while
          supabase/config.toml sets 6 locally. This form said "6-digit code"
          and a real patient received 8, which is the interface telling someone
          they have the wrong thing while they are holding the right one.
        */}
        <AuthField
          label="Verification code"
          id="token"
          name="token"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          disabled={verPending}
          placeholder="Enter the code from your email"
          hint="The code expires shortly after it's sent."
        />

        <AuthSubmit
          isPending={verPending}
          idleLabel="Verify code"
          pendingLabel="Checking…"
        />

        <button
          type="button"
          onClick={() => setStep("email")}
          className="w-full rounded text-[13px] text-text-secondary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Use a different email
        </button>
      </form>
    );
  }

  // ── Step 3 — choose a password; the link is created server-side here ──────
  return (
    <form action={completeAction} className="space-y-5" noValidate>
      <AuthNotice>Email confirmed. Choose a password to finish setting up your account.</AuthNotice>

      {cmpState.error && <AuthAlert>{cmpState.error}</AuthAlert>}

      <PasswordField
        label="Password"
        id="password"
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
        disabled={cmpPending}
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
        disabled={cmpPending}
        placeholder="Re-enter your password"
      />

      <AuthSubmit
        isPending={cmpPending}
        idleLabel="Create account"
        pendingLabel="Setting up…"
      />
    </form>
  );
}
