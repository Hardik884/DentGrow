"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkPortalAccount } from "@/actions/portal-link";

/**
 * PortalLinkForm
 *
 * Handles both onboarding paths:
 *
 * Step 1 — Phone lookup
 *   User enters their phone number and submits.
 *   Server action searches for an existing patient record.
 *
 * Step 2a — Existing patient found
 *   Link is created immediately. User is redirected to /portal.
 *
 * Step 2b — No record found
 *   Form transitions to a "new patient" confirmation UI.
 *   User enters their name and confirms. Server action creates a new patient
 *   record and links it. User is redirected to /portal.
 *
 * No dead ends — new patients are never blocked.
 */
export function PortalLinkForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form field values
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");

  // UI state machine
  const [step, setStep] = useState<"phone" | "confirm_new">("phone");
  const [confirmedPhone, setConfirmedPhone] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ── Step 1: phone lookup ──────────────────────────────────────────────────

  function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await linkPortalAccount({ phone: phone.trim() });

      if (result?.error) {
        setError(result.error);
        return;
      }

      if (result?.data?.status === "linked") {
        setSuccess(true);
        router.push("/portal");
        router.refresh();
        return;
      }

      if (result?.data?.status === "not_found") {
        // No existing record — move to new-patient confirmation step
        setConfirmedPhone(result.data.phone);
        setStep("confirm_new");
        return;
      }
    });
  }

  // ── Step 2b: create new patient ──────────────────────────────────────────

  function handleNewPatientSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await linkPortalAccount({
        phone: confirmedPhone,
        name: name.trim(),
        confirmNew: true,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      if (result?.data?.status === "linked") {
        setSuccess(true);
        router.push("/portal");
        router.refresh();
        return;
      }

      setError("Unexpected response. Please try again.");
    });
  }

  // ── Render: success ────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="text-center py-4 text-green-600 text-sm font-medium">
        Account linked! Redirecting to your portal…
      </div>
    );
  }

  // ── Render: step 1 — phone ─────────────────────────────────────────────────

  if (step === "phone") {
    return (
      <form onSubmit={handlePhoneSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="phone"
            className="block text-sm font-medium text-gray-700"
          >
            Phone Number
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isPending}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || !phone.trim()}
          className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Checking…" : "Continue"}
        </button>
      </form>
    );
  }

  // ── Render: step 2b — new patient confirmation ────────────────────────────

  return (
    <form onSubmit={handleNewPatientSubmit} className="space-y-4">
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
        <p className="font-medium">New patient detected</p>
        <p className="mt-0.5 text-blue-700">
          No existing record was found for{" "}
          <span className="font-mono font-semibold">{confirmedPhone}</span>.
          We&apos;ll create a new patient profile for you right now.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="name"
          className="block text-sm font-medium text-gray-700"
        >
          Full Name
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          required
          placeholder="e.g. Priya Sharma"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !name.trim()}
        className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Creating account…" : "Create My Account"}
      </button>

      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setStep("phone");
          setError(null);
          setName("");
        }}
        className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 disabled:opacity-50"
      >
        ← Use a different phone number
      </button>
    </form>
  );
}
