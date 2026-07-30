"use server";

import { resolveSession } from "@/lib/auth/session";
import { isBusinessBrainEnabled } from "@/lib/feature-flags";
import { AIError, getGeminiModel, withAITimeout } from "@/lib/ai/gemini";
import { buildDiagnosisExplanationPrompt } from "@/lib/ai/prompts";
import {
  explanationInputFor,
  verifyExplanation,
  type Diagnosis,
} from "@/business-brain";
import type { ActionResult } from "@/types";

/**
 * Business Brain — AI explanation Server Action.
 *
 * Rewrites one already-computed diagnosis in plain English. It adds no analysis:
 * the diagnosis, its evidence and its hypothesis statuses are all decided by the
 * deterministic engines before this runs, and the model only rephrases them.
 *
 * Three guardrails, in order of importance:
 *
 * 1. Output is VERIFIED before it is returned. `verifyExplanation` rejects any
 *    text containing a figure absent from the supplied facts, any advisory
 *    wording, or anything over-long. Failing output is discarded and logged
 *    rather than shown — a fabricated number in a money summary is worse than
 *    no summary.
 * 2. The fact set is closed and derived server-side from the diagnosis. The
 *    client cannot widen what the model is allowed to talk about.
 * 3. Failure is never fatal. Timeouts, API errors and rejected generations all
 *    return a message, so the dashboard keeps working with AI unavailable
 *    (CLAUDE.md §13.11).
 */

const EXPLANATION_UNAVAILABLE =
  "Plain-English explanation is unavailable right now. The findings above are unaffected.";

/** Kept short: this is one paragraph, not a conversation. */
const EXPLANATION_TIMEOUT_MS = 12_000;

export interface DiagnosisExplanation {
  readonly diagnosisId: string;
  readonly text: string;
}

/**
 * Explain a diagnosis in plain language.
 *
 * @param diagnosis          The diagnosis to explain, as produced by the pipeline.
 * @param signalDescriptions Descriptions of the signals behind it. These become
 *                           part of the closed fact set the model may restate.
 */
export async function explainDiagnosis(
  diagnosis: Diagnosis,
  signalDescriptions: string[] = [],
): Promise<ActionResult<DiagnosisExplanation>> {
  try {
    // Same gate as the dashboard: this is a development surface.
    const { profile } = await resolveSession();
    if (!profile || profile.role !== "dentist") {
      return { data: null, error: "Unauthorized" };
    }
    if (!isBusinessBrainEnabled(profile.clinic_id)) {
      return { data: null, error: "Unauthorized" };
    }

    if (!diagnosis?.id || !diagnosis.title || !Array.isArray(diagnosis.hypotheses)) {
      return { data: null, error: "Invalid diagnosis." };
    }

    const input = explanationInputFor(diagnosis, signalDescriptions);

    const prompt = buildDiagnosisExplanationPrompt({
      title: diagnosis.title,
      summary: diagnosis.summary,
      facts: [...input.facts],
      supported: diagnosis.hypotheses
        .filter((h) => h.status === "supported")
        .map((h) => h.statement),
      ruledOut: diagnosis.hypotheses
        .filter((h) => h.status === "contradicted")
        .map((h) => h.statement),
      undetermined: diagnosis.hypotheses
        .filter((h) => h.status === "undetermined")
        .map((h) => h.statement),
      persistence: diagnosis.persistence.replace(/_/g, " "),
    });

    const raw = await withAITimeout(async () => {
      const model = getGeminiModel();
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          // Low temperature: this is a rewording task, not a creative one.
          temperature: 0.2,
          maxOutputTokens: 220,
        },
      });
      return result.response.text();
    }, EXPLANATION_TIMEOUT_MS);

    const text = raw.trim();
    const verdict = verifyExplanation(text, input);

    if (!verdict.ok) {
      // Deliberately not returned to the user and deliberately not retried: a
      // generation that invented a figure or gave advice is not a transient
      // fault, and silently showing it would defeat the guardrail.
      console.error("[explainDiagnosis] rejected generation", {
        diagnosisId: diagnosis.id,
        violations: verdict.violations,
      });
      return { data: null, error: EXPLANATION_UNAVAILABLE };
    }

    return { data: { diagnosisId: diagnosis.id, text }, error: null };
  } catch (error) {
    if (error instanceof AIError) {
      console.error("[explainDiagnosis] AI unavailable:", error.message);
      return { data: null, error: EXPLANATION_UNAVAILABLE };
    }
    console.error("[explainDiagnosis]", error);
    return { data: null, error: EXPLANATION_UNAVAILABLE };
  }
}
