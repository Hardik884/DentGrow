"use client";

import { useState, useEffect } from "react";
import type { ClinicSettings } from "@/types";

/**
 * useClinicSettings
 *
 * Client-side hook for accessing clinic settings in Client Components.
 * Settings are passed as a prop from the Server Component (preferred pattern),
 * but this hook provides a fallback for deeply nested components that
 * need access without prop drilling.
 *
 * Usage pattern:
 * 1. Server Component fetches clinic settings via getClinicSettings().
 * 2. Settings are passed as prop to the client component tree.
 * 3. This hook is used only when prop drilling would exceed 2 levels.
 *
 * Note: For wait-time calculation in QueuePositionCard, averageAppointmentDuration
 * is passed directly as a prop from the portal layout — use that, not this hook.
 */
export function useClinicSettings(initial?: ClinicSettings | null) {
  const [settings, setSettings] = useState<ClinicSettings | null>(
    initial ?? null
  );
  const [isLoading, setIsLoading] = useState(!initial);

  useEffect(() => {
    if (initial) {
      setSettings(initial);
      setIsLoading(false);
      return;
    }

    // TODO: fetch clinic settings via a lightweight API call or
    // use React context populated by the Server Layout.
    setIsLoading(false);
  }, [initial]);

  return { settings, isLoading };
}
