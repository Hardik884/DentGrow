"use client";

/**
 * ThemeToggle — the Appearance control.
 *
 * A three-way segmented control (Light / Dark / System) rather than a binary
 * switch, because "System" is a real third choice and a switch cannot express
 * it. The active segment is marked with the emerald accent plus a label, so the
 * selection is never communicated by colour alone.
 *
 * Rendered inside the dentist/receptionist Clinic Settings page and the patient
 * portal profile page. Both mount the same component — one control, one
 * behaviour, no per-surface variants.
 */

import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/ThemeProvider";
import type { ThemePreference } from "@/lib/theme/constants";

const OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
  hint: string;
}[] = [
  { value: "light", label: "Light", icon: Sun, hint: "Always use the light theme" },
  { value: "dark", label: "Dark", icon: Moon, hint: "Always use the dark theme" },
  { value: "system", label: "System", icon: Monitor, hint: "Match your device setting" },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, mounted } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border bg-surface-muted p-1",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon, hint }) => {
        // Before mount the stored preference is unknown, so nothing is marked
        // active. Rendering a guessed selection here would flicker to the real
        // one a frame later and would not match the server HTML.
        const isActive = mounted && theme === value;

        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={hint}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-xs font-medium cursor-pointer",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-muted",
              isActive
                ? "bg-surface text-accent shadow-xs"
                : "text-text-secondary hover:text-text-primary hover:bg-surface/60",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The full Appearance card used on settings pages — the toggle plus its
 * explanatory copy. Kept next to the control so both settings surfaces
 * describe the feature identically.
 */
export function AppearanceSettings() {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-xs">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Appearance</h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            Choose how DentGrow looks. System follows your device&apos;s light or
            dark setting automatically.
          </p>
        </div>
        <ThemeToggle className="shrink-0" />
      </div>
    </section>
  );
}
