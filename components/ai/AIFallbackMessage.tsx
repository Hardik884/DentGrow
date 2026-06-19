interface AIFallbackMessageProps {
  message?: string;
}

/**
 * AIFallbackMessage
 *
 * Shared non-blocking fallback UI shown when Gemini is unavailable.
 * Must never block the surrounding page from rendering.
 * Per CLAUDE.md §13.11.
 */
export function AIFallbackMessage({
  message = "AI features are temporarily unavailable.",
}: AIFallbackMessageProps) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
      {message}
    </div>
  );
}
