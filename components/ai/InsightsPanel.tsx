import { generateInsights } from "@/actions/ai";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { AIFallbackMessage } from "./AIFallbackMessage";
import { Sparkles } from "lucide-react";

async function InsightsPanelInner() {
  const result = await generateInsights();

  if (result.error || !result.data) {
    return <AIFallbackMessage message="AI insights are temporarily unavailable." />;
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
        <h2 className="text-sm font-semibold text-text-primary">AI Insights</h2>
      </div>
      <div className="px-5 py-4">
        <ul className="space-y-2.5">
          {result.data.map((insight, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-text-primary leading-relaxed">
              <span className="text-text-disabled shrink-0 mt-0.5">·</span>
              <span>{insight}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function InsightsPanel() {
  return (
    <ErrorBoundary
      fallback={<AIFallbackMessage message="AI insights are temporarily unavailable." />}
    >
      <InsightsPanelInner />
    </ErrorBoundary>
  );
}
