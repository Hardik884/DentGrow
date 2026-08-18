"use client";

/**
 * Sonner renders toasts in a portal outside the normal tree, and it ships its
 * own light/dark styling. Left alone it would keep painting light toasts over a
 * dark app, so it is handed the resolved theme explicitly and its surface,
 * border and text are pinned to DentGrow's own tokens.
 */

import { Toaster } from "sonner";
import { useTheme } from "@/components/providers/ThemeProvider";

export function ThemedToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme}
      toastOptions={{
        style: {
          fontFamily: "var(--font-geist-sans)",
          fontSize: "13px",
          borderRadius: "8px",
          background: "var(--surface-raised)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          boxShadow: "var(--shadow-lg)",
        },
      }}
    />
  );
}
