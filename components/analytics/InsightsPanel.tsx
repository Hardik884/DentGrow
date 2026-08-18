import type { Insight } from "@/lib/analytics/queries";

interface InsightsPanelProps {
  insights: Insight[];
}

export function AnalyticsInsightsPanel({ insights }: InsightsPanelProps) {
  if (!insights.length) {
    return (
      <div className="bg-white border border-[#E3E9E6] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#151918] mb-2">Insights</h3>
        <p className="text-sm text-[#9BA39D]">No insights available for the selected period.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E3E9E6] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E3E9E6]">
        <h3 className="text-sm font-semibold text-[#151918]">Key Insights</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#EEF2F0]">
        {insights.map((insight, i) => (
          <div key={i} className="px-5 py-4">
            <p className="text-xs font-medium text-[#737A76] uppercase tracking-wider">{insight.title}</p>
            <p className="text-xl font-semibold text-[#151918] mt-1.5">{insight.value}</p>
            <p className="text-xs text-[#737A76] mt-0.5 leading-relaxed">{insight.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
