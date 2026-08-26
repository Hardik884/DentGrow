"use client";

/**
 * ThemeToggle — the Appearance control.
 *
 * A three-way segmented control (Light / Dark / System) rather than a binary
 * switch, because "System" is a real third choice and a switch cannot express
 * it. The active segment is marked with the emerald accent plus a label, so the
 * selection is never communicated by colour alone.
 *
 * Two sizes. The default shows icon + label and is used on the settings pages,
 * where there is room. `compact` shows icons only and is used in the dashboard
 * sidebar: three labelled segments need ~250px and the sidebar's content box is
 * 200px, so the labelled variant overflowed its container.
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

export function ThemeToggle({
  className,
  compact = false,
}: {
  className?: string;
  /** Icons only — for narrow containers like the sidebar footer. */
  compact?: boolean;
}) {
  const { theme, setTheme, mounted } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center rounded-lg border border-border bg-surface-muted p-1",
        compact ? "w-full gap-0.5" : "gap-1",
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
            // In compact mode the visible label is gone, so the accessible name
            // has to come from somewhere.
            aria-label={compact ? label : undefined}
            title={hint}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex items-center justify-center rounded-[6px] font-medium cursor-pointer",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface-muted",
              compact
                ? "flex-1 min-w-0 h-9 px-0"
                : "gap-1.5 px-3 py-1.5 text-xs",
              isActive
                ? "bg-surface text-accent shadow-xs"
                : "text-text-secondary hover:text-text-primary hover:bg-surface/60",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {!compact && label}
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
            Choose how OraMedha looks. Light is the default; System follows your
            device&apos;s light or dark setting automatically.
          </p>
        </div>
        <ThemeToggle className="shrink-0" />
      </div>
    </section>
  );
}
