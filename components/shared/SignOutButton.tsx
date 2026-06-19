"use client";

import { signOut } from "@/actions/auth";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

interface SignOutButtonProps {
  className?: string;
  variant?: "default" | "ghost";
}

/**
 * SignOutButton
 *
 * Calls the signOut Server Action. Displays a loading state while in flight.
 * signOut redirects to /login on the server — this component never receives
 * a success response.
 *
 * Used in DashboardSidebar and PortalNav.
 */
export function SignOutButton({ className, variant = "ghost" }: SignOutButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await signOut();
    });
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={isPending}
      aria-label="Sign out"
      className={cn(
        "text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "ghost"
          ? "text-gray-500 hover:text-gray-900"
          : "text-red-600 hover:text-red-700",
        className
      )}
    >
      {isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}
