"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  beginMfaEnrolment,
  confirmMfaEnrolment,
  removeMfaFactor,
  type MfaEnrolment,
  type MfaFactorSummary,
} from "@/actions/mfa";

/**
 * MfaSettings — turning on two-step verification.
 *
 * WHY THIS EXISTS AT ALL
 *   A single password protected an account that can read an entire clinic's
 *   patient records, prescriptions and financial history. This is the screen
 *   that lets someone fix that for their own account.
 *
 * THE FLOW, AND WHY IT HAS THREE STEPS RATHER THAN TWO
 *   Scan → enter a code → done. The middle step is not ceremony: enrolment
 *   without verification produces an account that BELIEVES it is protected by
 *   an app that was never actually set up, and the person discovers that at
 *   their next sign-in, locked out, with no way back in. The factor does not
 *   count until a real code from the real app has been accepted.
 *
 *   The secret is shown as text alongside the QR code because a laptop camera
 *   cannot scan a code on its own screen, and a dentist setting this up on the
 *   clinic desktop has no second device pointed at it.
 */
export function MfaSettings({
  initialFactors,
}: {
  initialFactors: MfaFactorSummary[];
}) {
  const [factors, setFactors] = useState(initialFactors);
  const [enrolment, setEnrolment] = useState<MfaEnrolment | null>(null);
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();

  const enrolled = factors.length > 0;

  function begin() {
    startTransition(async () => {
      const result = await beginMfaEnrolment();
      if (result.error || !result.data) {
        toast.error(result.error ?? "Could not start setup.");
        return;
      }
      setEnrolment(result.data);
      setCode("");
    });
  }

  function confirm() {
    if (!enrolment) return;
    startTransition(async () => {
      const result = await confirmMfaEnrolment({
        factorId: enrolment.factorId,
        code,
      });

      if (result.error) {
        toast.error(result.error);
        setCode("");
        return;
      }

      setFactors([
        { id: enrolment.factorId, friendlyName: "Authenticator app", createdAt: null },
      ]);
      setEnrolment(null);
      setCode("");
      toast.success("Two-step verification is on.");
    });
  }

  function remove(factorId: string) {
    startTransition(async () => {
      const result = await removeMfaFactor({ factorId });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setFactors((current) => current.filter((f) => f.id !== factorId));
      toast.success("Two-step verification is off.");
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-xs">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            {enrolled ? (
              <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            )}
            Two-step verification
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
            {enrolled
              ? "On. You'll enter a code from your authenticator app each time you sign in."
              : "Add a second step to sign-in using an authenticator app. Your password alone can open every patient record in this clinic."}
          </p>
        </div>

        {!enrolment && (
          <div className="shrink-0">
            {enrolled ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => remove(factors[0].id)}
              >
                Turn off
              </Button>
            ) : (
              <Button type="button" disabled={pending} onClick={begin}>
                {pending ? "Preparing…" : "Set up"}
              </Button>
            )}
          </div>
        )}
      </div>

      {enrolment && (
        <div className="mt-5 space-y-4 border-t border-border pt-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            {/* Supabase returns the otpauth:// URI already rendered as an SVG
                data-URL, so there is no QR library to add and no secret passing
                through a third-party image service. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrolment.qrCode}
              alt="QR code for setting up your authenticator app"
              className="h-40 w-40 shrink-0 rounded-lg border border-border bg-white p-2"
            />

            <div className="min-w-0 space-y-3">
              <p className="text-xs leading-relaxed text-text-secondary">
                Scan this with your authenticator app (Google Authenticator, 1Password,
                Authy — any of them). If you can&apos;t scan it, enter this key by hand:
              </p>

              <code className="block break-all rounded-md border border-border bg-surface-muted px-2.5 py-2 font-mono text-[11px] text-text-primary">
                {enrolment.secret}
              </code>

              <div className="space-y-1.5">
                <label
                  htmlFor="mfa-confirm-code"
                  className="block text-[13px] font-medium text-text-strong"
                >
                  Enter the 6-digit code to finish
                </label>
                <Input
                  id="mfa-confirm-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  disabled={pending}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="h-10 max-w-[160px] font-mono tracking-[0.2em]"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={pending || code.length !== 6}
                  onClick={confirm}
                >
                  {pending ? "Checking…" : "Turn on"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setEnrolment(null);
                    setCode("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
