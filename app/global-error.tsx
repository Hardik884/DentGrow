"use client";

import { useEffect } from "react";
import { THEME_INIT_SCRIPT } from "@/lib/theme/script";

/**
 * app/global-error.tsx — boundary of last resort.
 *
 * Catches errors thrown by the root layout itself, which `app/error.tsx` sits
 * inside of and therefore cannot handle. It replaces the whole document, so it
 * must render its own <html>/<body> and cannot rely on the app's providers,
 * fonts, or shared components.
 *
 * Theming note: because it replaces the document, it never receives
 * globals.css or the ThemeProvider — so it carries a miniature copy of the
 * theme. It runs the same bootstrap script to set the `dark` class from the
 * stored preference, and declares just the handful of colours it paints. A
 * dark-mode user hitting a crash should not be flashbanged by a white page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/global-error] unhandled error:", error, error.digest ? `digest=${error.digest}` : "");
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root {
                color-scheme: light;
                --ge-bg: #F6F8F6;
                --ge-title: #151918;
                --ge-body: #5B635E;
                --ge-meta: #9BA39D;
                --ge-accent: #0D6B5E;
                --ge-accent-fg: #FFFFFF;
              }
              .dark {
                color-scheme: dark;
                --ge-bg: #0F1412;
                --ge-title: #F1F5F3;
                --ge-body: #C2CCC8;
                --ge-meta: #5E6A65;
                --ge-accent: #35A18F;
                --ge-accent-fg: #0F1412;
              }
            `,
          }}
        />
      </head>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "var(--ge-bg)" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div style={{ maxWidth: "28rem", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--ge-title)" }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: "0.875rem", color: "var(--ge-body)", marginTop: "0.5rem" }}>
              We hit an unexpected problem. Your data has not been changed.
            </p>
            {error.digest && (
              <p style={{ fontSize: "0.75rem", color: "var(--ge-meta)", marginTop: "0.5rem" }}>
                Reference: <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
              </p>
            )}
            <button
              onClick={reset}
              style={{
                marginTop: "1rem",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "var(--ge-accent-fg)",
                background: "var(--ge-accent)",
                border: 0,
                borderRadius: "0.375rem",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
