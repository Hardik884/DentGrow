import { generateInsights } from "@/actions/ai";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { AIFallbackMessage } from "./AIFallbackMessage";

/**
 * InsightsPanel
 *
 * AI Insights card on the dentist dashboard.
 * Generates 3–5 bullet-point insights from today's clinic metrics.
 *
 * Rendered as a Server Component — generated on page load (non-blocking).
 * Wrapped in ErrorBoundary so any failure shows a fallback, not an error.
 * If Gemini is unavailable, shows AIFallbackMessage inline.
 *
 * Per CLAUDE.md §13.11: never blocks the dashboard from rendering.
 */
async function InsightsPanelInner() {
  const result = await generateInsights();

  if (result.error || !result.data) {
    return (
      <AIFallbackMessage message="AI insights are temporarily unavailable." />
    );
  }

  return (
    <div className="bg-white border rounded-lg p-4">
      <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <span>✨</span> AI Insights
      </h2>
      <ul className="space-y-2">
        {result.data.map((insight, i) => (
          <li key={i} className="text-sm text-gray-700 flex gap-2">
            <span className="text-blue-400 shrink-0">•</span>
            {insight}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InsightsPanel() {
  return (
    <ErrorBoundary
      fallback={
        <AIFallbackMessage message="AI insights are temporarily unavailable." />
      }
    >
      <InsightsPanelInner />
    </ErrorBoundary>
  );
}
