"use client";

import { useActionState } from "react";
import { signUp } from "@/actions/auth";
import type { ActionResult } from "@/types";

const initialState: ActionResult<null> = { data: null, error: null };

/**
 * SignupForm
 *
 * Client component for patient portal self-registration.
 * Delegates mutation to the signUp Server Action via useActionState.
 * On success, signUp calls redirect() to /portal/setup.
 */
export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signUp, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {/* Error banner */}
      {state.error && (
        <div
          role="alert"
          className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}

      {/* Email */}
      <div className="space-y-1">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-700"
        >
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
                     placeholder-gray-400 shadow-sm outline-none
                     focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20
                     disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
          placeholder="you@example.com"
        />
      </div>

      {/* Password */}
      <div className="space-y-1">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          disabled={isPending}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
                     placeholder-gray-400 shadow-sm outline-none
                     focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20
                     disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
          placeholder="Min. 8 characters"
        />
      </div>

      {/* Confirm password */}
      <div className="space-y-1">
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-gray-700"
        >
          Confirm password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          disabled={isPending}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
                     placeholder-gray-400 shadow-sm outline-none
                     focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20
                     disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
          placeholder="••••••••"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold
                   text-white shadow-sm transition-colors
                   hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2
                   focus-visible:ring-blue-600 focus-visible:ring-offset-2
                   disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Creating account…" : "Create account"}
      </button>

      <p className="text-xs text-gray-500 text-center">
        For clinic staff accounts, contact your administrator.
      </p>
    </form>
  );
}
