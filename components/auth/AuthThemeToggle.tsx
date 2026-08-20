"use client";

import { ThemeToggle } from "@/components/shared/ThemeToggle";

/**
 * AuthThemeToggle — the appearance control in the sign-in header.
 *
 * Signing in is often the first DentGrow screen someone sees, and it is the one
 * screen with no sidebar to reach Settings from, so the Light / Dark / System
 * choice is offered here directly. The compact (icon-only) variant is used
 * because the labelled one needs ~250px and would crowd the brand lockup at
 * 320px; it is pinned to a fixed width so the three segments don't stretch.
 */
export function AuthThemeToggle() {
  return <ThemeToggle compact className="w-[112px] shrink-0" />;
}
