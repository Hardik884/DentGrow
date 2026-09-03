"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeMfaChallenge, startMfaChallenge } from "@/actions/mfa";
import { AuthAlert, AuthField, AuthSubmit } from "@/components/auth/AuthFields";

/**
 * MfaChallengeForm
 *
 * A challenge is created on mount rather than on submit. Supabase issues a
 * challenge id that the verify call must quote, so creating it up front means
 * one round trip when the code is entered instead of two — which matters for a
 * value that changes every thirty seconds and that people type at the last
 * moment.
 *
 * On success it navigates to "/" and lets the middleware route by role. This
 * page cannot know where the user belongs, and hardcoding /dentist here would
 * send a receptionist to a page they are not allowed on.
 */
export function MfaChallengeForm() {
  const router = useRouter();
  const [challenge, setChallenge] = useState<{
    factorId: string;
    challengeId: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    startMfaChallenge().then((result) => {
      if (cancelled) return;
      if (result.data) setChallenge(result.data);
      else setError(result.error ?? "Could not start verification.");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!challenge) return;

    setError(null);
    startTransition(async () => {
      const result = await completeMfaChallenge({ ...challenge, code });

      if (result.error) {
        setError(result.error);
        setCode("");
        // A used challenge cannot be retried, so a fresh one is issued for the
        // next attempt. Without this, a single mistyped digit would leave the
        // form permanently unable to succeed.
        const next = await startMfaChallenge();
        if (next.data) setChallenge(next.data);
        return;
      }

      router.replace("/");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error && <AuthAlert>{error}</AuthAlert>}

      <AuthField
        label="Verification code"
        id="code"
        name="code"
        // One-time-code so a phone offers the code from the notification, and
        // numeric so the right keyboard appears.
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        autoFocus
        required
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        disabled={pending || !challenge}
        hint="The code changes every 30 seconds."
      />

      <AuthSubmit
        isPending={pending}
        disabled={code.length !== 6 || !challenge}
        idleLabel="Verify"
        pendingLabel="Verifying…"
      />
    </form>
  );
}
