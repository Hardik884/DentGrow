/**
 * lib/clinic/constants.ts
 *
 * Clinic constants with no runtime dependencies.
 *
 * Extracted from `lib/clinic/config.ts` because that module is `server-only`
 * and request-scoped (React `cache()`), so it cannot be imported from plain
 * Node contexts such as the Business Brain metrics repository or its tests.
 * `config.ts` re-exports from here, so existing imports are unaffected and the
 * default remains defined in exactly one place.
 */

/** Fallback clinic timezone when `clinic_settings.timezone` is unset. */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";
