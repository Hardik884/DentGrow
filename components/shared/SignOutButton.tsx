"use client";

import { signOut } from "@/actions/auth";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";

interface SignOutButtonProps {
  className?: string;
}

export function SignOutButton({ className }: SignOutButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await signOut();
    });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isPending}
      aria-label="Sign out"
      className={cn(
        "flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium",
        "text-[#71717A] hover:text-[#09090B] hover:bg-[#F4F4F5]",
        "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}
