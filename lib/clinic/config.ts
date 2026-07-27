import "server-only";
import { cache } from "react";
import { resolveSession } from "@/lib/auth/session";

/**
 * lib/clinic/config.ts
 *
 * Request-scoped clinic configuration resolver.
 *
 * `clinic_settings` (timezone, average appointment duration, hours, contact
 * details) change extremely rarely but were previously re-queried on almost
 * every page that needed the clinic timezone — each query preceded by its own
 * auth + profile lookup.
 *
 * `getClinicConfig` resolves the clinic id + timezone once per request via
 * `cache()`, reusing the already-memoised `resolveSession`. The first caller
 * pays for a single `clinic_settings` row read; everyone else in the request
 * reuses it.
 */

// Defined in ./constants so non-server contexts (Business Brain repository and
// its tests) can use it without pulling in `server-only`. Re-exported here so
// existing `@/lib/clinic/config` imports keep working.
export { DEFAULT_TIMEZONE } from "./constants";
import { DEFAULT_TIMEZONE } from "./constants";

export type ClinicConfig = {
  clinicId: string;
  timezone: string;
};

/**
 * getClinicConfig — request-scoped, memoised.
 * Returns the caller's clinic id and timezone (falls back to DEFAULT_TIMEZONE).
 */
export const getClinicConfig = cache(async (): Promise<ClinicConfig> => {
  const { db, profile } = await resolveSession();
  if (!profile?.clinic_id) {
    return { clinicId: "", timezone: DEFAULT_TIMEZONE };
  }

  const { data } = await db
    .from("clinic_settings")
    .select("timezone")
    .eq("clinic_id", profile.clinic_id)
    .maybeSingle();

  return {
    clinicId: profile.clinic_id,
    timezone:
      (data as { timezone?: string } | null)?.timezone ?? DEFAULT_TIMEZONE,
  };
});

/** Convenience: just the clinic timezone for the current request. */
export const getClinicTimezone = cache(async (): Promise<string> => {
  return (await getClinicConfig()).timezone;
});
