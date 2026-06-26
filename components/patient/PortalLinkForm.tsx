"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkPortalAccount } from "@/actions/portal-link";
import type { ClinicOption } from "@/actions/clinics";

interface PortalLinkFormProps {
  /** Clinics available to choose from (populated from the clinics table). */
  clinics: ClinicOption[];
  /** Clinic chosen at signup — when present the selector is locked to it. */
  presetClinicId?: string;
  /** Phone entered at signup — prefilled so the user need not retype it. */
  presetPhone?: string;
}

/**
 * PortalLinkForm
 *
 * Handles both onboarding paths, always scoped to a single clinic:
 *
 * Step 0 — Clinic
 *   The clinic chosen at signup is carried through and locked. If it is
 *   missing, the user selects one from the clinics table. The selected clinic
 *   is sent to the server so the patient lookup/creation is scoped to it — a
 *   phone number registered in another clinic is never matched.
 *
 * Step 1 — Phone lookup
 *   User enters their phone number and submits.
 *   Server action searches for an existing patient record IN THE SELECTED CLINIC.
 *
 * Step 2a — Existing patient found → link created, redirect to /portal.
 * Step 2b — No record found → confirm name → new patient created in the
 *   selected clinic, then linked. No dead ends.
 */
export function PortalLinkForm({
  clinics,
  presetClinicId,
  presetPhone,
}: PortalLinkFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Clinic is locked when carried from signup; otherwise the user picks it.
  const clinicLocked = Boolean(presetClinicId);
  const [clinicId, setClinicId] = useState(presetClinicId ?? "");
  const presetClinicName = clinics.find((c) => c.id === presetClinicId)?.name;

  // Form field values
  const [phone, setPhone] = useState(presetPhone ?? "");
  const [name, setName] = useState("");

  // UI state machine
  const [step, setStep] = useState<"phone" | "confirm_new">("phone");
  const [confirmedPhone, setConfirmedPhone] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ── Step 1: phone lookup ──────────────────────────────────────────────────

  function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicId) {
      setError("Please select your clinic.");
      return;
    }
    if (!phone.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await linkPortalAccount({ clinicId, phone: phone.trim() });

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
        clinicId,
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

  // Shared clinic selector block (locked label or dropdown).
  const clinicBlock = (
    <div className="space-y-1.5">
      <label htmlFor="clinic" className="block text-sm font-medium text-gray-700">
        Clinic
      </label>
      {clinicLocked ? (
        <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
          {presetClinicName ?? "Selected clinic"}
        </div>
      ) : (
        <select
          id="clinic"
          required
          value={clinicId}
          onChange={(e) => setClinicId(e.target.value)}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="" disabled>
            Select a clinic…
          </option>
          {clinics.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  // ── Render: step 1 — phone ─────────────────────────────────────────────────

  if (step === "phone") {
    return (
      <form onSubmit={handlePhoneSubmit} className="space-y-4">
        {clinicBlock}

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
          disabled={isPending || !phone.trim() || !clinicId}
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
