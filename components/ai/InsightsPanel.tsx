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
    <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-[#71717A]" aria-hidden />
        <h2 className="text-sm font-semibold text-[#09090B]">AI Insights</h2>
      </div>
      <div className="px-5 py-4">
        <ul className="space-y-2.5">
          {result.data.map((insight, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-[#09090B] leading-relaxed">
              <span className="text-[#A1A1AA] shrink-0 mt-0.5">·</span>
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
