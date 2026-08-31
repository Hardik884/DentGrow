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
import { addDays } from "@/business-brain";
import { getClinicConfig } from "@/lib/clinic/config";
import { getTodayInTimezone } from "@/lib/utils";
import { persistMetricRange, type PersistResult } from "@/lib/business-brain/persist-metrics";
import { revalidatePath } from "next/cache";
import { DismissProblemSchema, type ActionResult } from "@/types";

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

/**
 * Record measured metrics so history stops being reconstructed.
 *
 * The pipeline reads `metric_history` for its history days and recomputes only
 * what is missing, so without something writing to that table the optimisation
 * never engages and every dashboard load re-derives a full week. This is that
 * writer, exposed as an explicit action rather than a side effect of rendering:
 * a page render must not write, and `pipeline.spec.ts` asserts the whole run
 * leaves every table's row count unchanged.
 *
 * Records COMPLETED days only. Today's figures are still moving — a snapshot
 * taken at 11:00 does not describe the day — so freezing today would store a
 * half-finished number as if it were the day's result. The range therefore ends
 * yesterday.
 *
 * Idempotent: the store upserts on (clinic, date, key), so re-running corrects
 * rather than duplicates, and re-running after a data fix is how a correction
 * propagates.
 *
 * @param days How many completed days back to record, ending yesterday.
 */
export async function recordMetricHistory(days = 30): Promise<ActionResult<PersistResult>> {
  try {
    // Same gate as the dashboard: this is a development surface.
    const { profile } = await resolveSession();
    if (!profile || profile.role !== "dentist") {
      return { data: null, error: "Forbidden" };
    }
    if (!isBusinessBrainEnabled(profile.clinic_id)) {
      return { data: null, error: "Not available for this clinic." };
    }

    const bounded = Math.min(Math.max(1, Math.trunc(days)), 365);
    const { timezone } = await getClinicConfig();
    // Yesterday in the CLINIC's timezone, not the server's: a job running at
    // 00:30 UTC would otherwise record the wrong day for a clinic in IST.
    const to = addDays(getTodayInTimezone(timezone), -1);
    const from = addDays(to, -(bounded - 1));

    const result = await persistMetricRange(profile.clinic_id, from, to);
    return { data: result, error: null };
  } catch (error) {
    console.error("[recordMetricHistory]", error);
    return { data: null, error: "Could not record metric history." };
  }
}

/**
 * Snooze one problem category for this clinic.
 *
 * Records a decision, never a measurement. The pipeline still computes the
 * problem in full on every run; this only stops the briefing drawing its card
 * while the snooze stands.
 *
 * Two guards make a snooze safe to offer at all:
 *
 * 1. It EXPIRES. `days` is bounded, so a decision made today cannot silently
 *    govern the clinic six months from now.
 * 2. It is bound to the severity the problem carried when dismissed
 *    (`severityAtDismissal`). If the problem escalates a band the card returns
 *    immediately, whatever the expiry says — see `isSuppressed`. Without that, a
 *    snooze on "3 patients owe money" would keep hiding it at 40 patients.
 *
 * A reason is required rather than optional: a snooze with no reason is
 * indistinguishable from a mis-click when it is read back weeks later, and the
 * reasons are how we learn which false positives are worth fixing in the schema
 * instead of papering over.
 */
export async function dismissProblem(input: {
  category: string;
  severityAtDismissal: string;
  reason: string;
  days: number;
}): Promise<ActionResult<{ expiresAt: string }>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile || profile.role !== "dentist") {
      return { data: null, error: "Forbidden" };
    }
    if (!isBusinessBrainEnabled(profile.clinic_id)) {
      return { data: null, error: "Not available for this clinic." };
    }

    const parsed = DismissProblemSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const expiresAt = new Date(
      Date.now() + parsed.data.days * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error } = await db.from("problem_dismissals").insert({
      clinic_id: profile.clinic_id,
      category: parsed.data.category,
      severity_at_dismissal: parsed.data.severityAtDismissal,
      reason: parsed.data.reason.trim(),
      expires_at: expiresAt,
      dismissed_by: profile.id,
    });
    if (error) {
      console.error("[dismissProblem]", error.message);
      return { data: null, error: "Could not snooze this problem." };
    }

    // The briefing is a server render, so it has to be re-read for the card to
    // disappear. Revalidating here rather than relying on the client keeps the
    // page's own data the single source of what is shown.
    revalidatePath("/dentist/business-brain");
    return { data: { expiresAt }, error: null };
  } catch (error) {
    console.error("[dismissProblem]", error);
    return { data: null, error: "Could not snooze this problem." };
  }
}
