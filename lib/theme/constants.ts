/**
 * Theme constants — shared by the no-flash inline script, the ThemeProvider,
 * and the Appearance setting UI.
 *
 * Keep this module free of React and of any browser-only API access at module
 * scope: the inline script in the root layout mirrors these literals, and the
 * values are also read on the server while rendering.
 */

export const THEME_STORAGE_KEY = "dentgrow-theme";

/** What the user picked. `system` defers to the OS preference. */
export type ThemePreference = "light" | "dark" | "system";

/** What is actually painted. `system` always resolves to one of these. */
export type ResolvedTheme = "light" | "dark";

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "light",
  "dark",
  "system",
] as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Light is the default. DentGrow shipped light-only for its whole life, and an
 * existing user who has never opened the Appearance setting should keep seeing
 * exactly the app they already know — not have it change because their laptop
 * happens to be set to dark. Dark and System are opt-in.
 */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "light";
