"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * app/error.tsx — application-wide error boundary.
 *
 * Before this existed, ANY uncaught client error tore the React tree down to
 * Next.js's built-in screen ("Application error: a client-side exception has
 * occurred"), which tells a clinic nothing and offers no way out. A rejected
 * Server Action promise inside a transition is enough to trigger it — that is
 * how a consent upload that exceeded the request-body cap took the page down.
 *
 * Individual features still handle their own failures inline (a failed upload
 * shows a toast, not this page). This is the last line of defence for the
 * genuinely unexpected: it keeps the user inside the app, with a way to retry.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Preserve the real fault for debugging. `digest` is the server-side id
    // Next assigns when the message itself is withheld in production.
    console.error("[app/error] unhandled error:", error, error.digest ? `digest=${error.digest}` : "");
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-lg font-semibold text-[#09090B]">Something went wrong</h1>
        <p className="text-sm text-[#52525B]">
          We hit an unexpected problem loading this page. Your data has not been changed.
        </p>
        {error.digest && (
          <p className="text-xs text-[#A1A1AA]">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        )}
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button variant="default" size="sm" onClick={reset}>
            Try again
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.assign("/")}>
            Go to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
