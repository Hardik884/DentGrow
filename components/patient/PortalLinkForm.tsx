"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkPortalAccount } from "@/actions/portal-link";

/**
 * PortalLinkForm
 *
 * Client component — phone-based portal account linking form.
 * Submits to actions/portal-link.ts → linkPortalAccount(phone).
 * On success: redirects to /portal.
 * On no-match: shows "Contact your clinic" message.
 */
export function PortalLinkForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await linkPortalAccount({ phone: phone.trim() });

      if (result?.error) {
        setError(result.error);
        return;
      }

      setSuccess(true);
      router.push("/portal");
      router.refresh();
    });
  }

  if (success) {
    return (
      <div className="text-center py-4 text-green-600 text-sm font-medium">
        Account linked! Redirecting to your portal…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
        {isPending ? "Linking…" : "Link My Account"}
      </button>
    </form>
  );
}
