"use client";

import { useState } from "react";
import { generatePatientSummary } from "@/actions/ai";
import { AIFallbackMessage } from "./AIFallbackMessage";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCcw } from "lucide-react";

interface PatientSummaryCardProps {
  patientId: string;
}

function PatientSummaryCardInner({ patientId }: PatientSummaryCardProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setIsLoading(true);
    setError(null);
    setSummary(null);

    const result = await generatePatientSummary(patientId);
    if (result.error) setError(result.error);
    else setSummary(result.data);
    setIsLoading(false);
  }

  return (
    <div className="bg-white border border-[#E3E9E6] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E3E9E6] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[#737A76]" aria-hidden />
          <h2 className="text-sm font-semibold text-[#151918]">AI Summary</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <LoadingSpinner size="sm" />
              Generating…
            </>
          ) : summary ? (
            <>
              <RefreshCcw className="h-3 w-3" aria-hidden />
              Regenerate
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" aria-hidden />
              Generate
            </>
          )}
        </Button>
      </div>

      <div className="px-5 py-4">
        {!summary && !isLoading && !error && (
          <p className="text-sm text-[#9BA39D]">
            Generate an AI-powered clinical summary for this patient.
          </p>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-[#737A76]">
            <LoadingSpinner size="sm" />
            Analysing patient records…
          </div>
        )}

        {error && <AIFallbackMessage message={error} />}

        {summary && (
          <div className="text-sm text-[#151918] leading-relaxed whitespace-pre-wrap">
            {summary}
          </div>
        )}
      </div>
    </div>
  );
}

export function PatientSummaryCard({ patientId }: PatientSummaryCardProps) {
  return (
    <ErrorBoundary fallback={<AIFallbackMessage message="Unable to load AI summary." />}>
      <PatientSummaryCardInner patientId={patientId} />
    </ErrorBoundary>
  );
}
