"use client";

import { useEffect } from "react";

/**
 * app/global-error.tsx — boundary of last resort.
 *
 * Catches errors thrown by the root layout itself, which `app/error.tsx` sits
 * inside of and therefore cannot handle. It replaces the whole document, so it
 * must render its own <html>/<body> and cannot rely on the app's providers,
 * fonts, or shared components.
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
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#FAFAFA" }}>
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
            <h1 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#09090B" }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: "0.875rem", color: "#52525B", marginTop: "0.5rem" }}>
              We hit an unexpected problem. Your data has not been changed.
            </p>
            {error.digest && (
              <p style={{ fontSize: "0.75rem", color: "#A1A1AA", marginTop: "0.5rem" }}>
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
                color: "#FAFAFA",
                background: "#0F766E",
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
