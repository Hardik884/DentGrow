"use client";

import { useState } from "react";
import { generatePatientSummary } from "@/actions/ai";
import { AIFallbackMessage } from "./AIFallbackMessage";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

interface PatientSummaryCardProps {
  patientId: string;
}

/**
 * PatientSummaryCard
 *
 * "Generate Summary" trigger + AI-generated result display.
 * Dentist role only.
 *
 * Pattern:
 * 1. Dentist clicks "Generate Summary" button.
 * 2. Component calls generatePatientSummary(patientId) Server Action.
 * 3. On success: renders summary text.
 * 4. On error: renders AIFallbackMessage (non-blocking).
 *
 * Summary is not stored — regenerated on each click.
 */
function PatientSummaryCardInner({ patientId }: PatientSummaryCardProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setIsLoading(true);
    setError(null);
    setSummary(null);

    const result = await generatePatientSummary(patientId);

    if (result.error) {
      setError(result.error);
    } else {
      setSummary(result.data);
    }

    setIsLoading(false);
  }

  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-1">
          <span>✨</span> AI Summary
        </h2>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isLoading}
          className="px-3 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50 disabled:opacity-50"
        >
          {isLoading ? "Generating…" : summary ? "Regenerate" : "Generate Summary"}
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <LoadingSpinner size="sm" />
          <span>Analysing patient records…</span>
        </div>
      )}

      {error && <AIFallbackMessage message={error} />}

      {summary && (
        <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
          {summary}
        </div>
      )}
    </div>
  );
}

export function PatientSummaryCard({ patientId }: PatientSummaryCardProps) {
  return (
    <ErrorBoundary
      fallback={<AIFallbackMessage message="Unable to load AI summary." />}
    >
      <PatientSummaryCardInner patientId={patientId} />
    </ErrorBoundary>
  );
}
