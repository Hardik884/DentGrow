"use client";

/**
 * ThemeProvider
 *
 * Owns the Light / Dark / System preference for the whole app. It does exactly
 * two things: keep the preference in localStorage, and keep the `dark` class +
 * `color-scheme` on <html> in sync with it.
 *
 * It deliberately does NOT render any wrapper markup or hold theme colors —
 * every colour lives in CSS variables in app/globals.css, so flipping the class
 * on <html> is the entire theme switch. That is why switching is instant and
 * needs no page refresh.
 *
 * Hydration: the real class is applied before paint by THEME_INIT_SCRIPT in the
 * root layout. This provider reads that already-applied state out of the DOM on
 * mount rather than assuming a default, so the server HTML and the client tree
 * never disagree.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
  isThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme/constants";

type ThemeContextValue = {
  /** What the user picked: light, dark, or system. */
  theme: ThemePreference;
  /** What is actually painted right now — `system` resolved against the OS. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  /**
   * False during the first client render. UI that would otherwise render
   * differently on server vs client (e.g. a toggle showing the active option)
   * can wait on this to avoid a hydration mismatch.
   */
  mounted: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    // localStorage can throw when site data is blocked — fall through.
  }
  return DEFAULT_THEME_PREFERENCE;
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;
}

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return systemPrefersDark() ? "dark" : "light";
  return preference;
}

/**
 * Applies the theme to the document.
 *
 * Transitions are suppressed for one frame while the class flips. Hundreds of
 * elements carry `transition-colors`, and without this the whole UI visibly
 * smears between palettes instead of switching cleanly. Suppressing rather than
 * animating also means there is nothing to disable for prefers-reduced-motion.
 */
function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.setAttribute("data-theme-switching", "");
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      root.removeAttribute("data-theme-switching");
    });
  });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start from the server-safe default so the first render matches the server.
  // The effect below immediately corrects it from localStorage/DOM on mount.
  const [theme, setThemeState] = useState<ThemePreference>(
    DEFAULT_THEME_PREFERENCE,
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = readStoredPreference();
    setThemeState(stored);
    setResolvedTheme(resolve(stored));
    setMounted(true);
  }, []);

  // Follow the OS while (and only while) the preference is `system`.
  useEffect(() => {
    if (!mounted || theme !== "system") return;

    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      const next: ResolvedTheme = media.matches ? "dark" : "light";
      setResolvedTheme(next);
      applyTheme(next);
    };

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mounted, theme]);

  // Keep other tabs in sync — changing the theme in one tab should not leave
  // another tab of the same app on the old palette.
  useEffect(() => {
    if (!mounted) return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next = isThemePreference(event.newValue)
        ? event.newValue
        : DEFAULT_THEME_PREFERENCE;
      setThemeState(next);
      const nextResolved = resolve(next);
      setResolvedTheme(nextResolved);
      applyTheme(nextResolved);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [mounted]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference simply won't survive a reload if storage is unavailable.
    }
    const nextResolved = resolve(next);
    setResolvedTheme(nextResolved);
    applyTheme(nextResolved);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, mounted }),
    [theme, resolvedTheme, setTheme, mounted],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return context;
}
