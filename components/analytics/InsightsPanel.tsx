import type { Insight } from "@/lib/analytics/queries";

interface InsightsPanelProps {
  insights: Insight[];
}

export function AnalyticsInsightsPanel({ insights }: InsightsPanelProps) {
  if (!insights.length) {
    return (
      <div className="bg-surface border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Insights</h3>
        <p className="text-sm text-text-disabled">No insights available for the selected period.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">Key Insights</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-surface-muted">
        {insights.map((insight, i) => (
          <div key={i} className="px-5 py-4">
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">{insight.title}</p>
            <p className="text-xl font-semibold text-text-primary mt-1.5">{insight.value}</p>
            <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{insight.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
