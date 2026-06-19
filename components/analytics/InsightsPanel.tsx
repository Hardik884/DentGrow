import type { Insight } from "@/lib/analytics/queries";
import { cn } from "@/lib/utils";

interface InsightsPanelProps {
  insights: Insight[];
}

/**
 * InsightsPanel (analytics) — displays rule-based insights (no AI).
 * Server component — data is passed as props from the parent Server Component.
 */
export function AnalyticsInsightsPanel({ insights }: InsightsPanelProps) {
  if (!insights.length) {
    return (
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Insights</h3>
        <p className="text-sm text-gray-400">No insights available for the selected period.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg p-4">
      <h3 className="font-semibold text-gray-900 mb-3">Key Insights</h3>
      <div className="space-y-3">
        {insights.map((insight, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 p-3 rounded-md",
              i % 2 === 0 ? "bg-blue-50" : "bg-green-50"
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {insight.title}
              </p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{insight.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{insight.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
