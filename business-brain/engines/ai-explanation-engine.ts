/**
 * AIExplanationEngine
 *
 * RESPONSIBILITY:
 * Turns structured Business Brain outputs into clear, plain-language explanations
 * for clinic staff. It explains decisions; it does not make them.
 *
 * Consumes:  a finished Diagnosis and the facts already established for it
 * Produces:  a short plain-language restatement
 *
 * THE BOUNDARY, AND WHY IT IS ENFORCED IN CODE
 * --------------------------------------------
 * This is the only place in the Business Brain where a language model is
 * involved, and it is involved as a WRITER, never as a reasoner. It may rephrase
 * what the deterministic engines concluded. It may not weigh evidence, settle a
 * hypothesis the engine left undetermined, introduce a figure, or suggest a
 * course of action.
 *
 * A prompt alone cannot guarantee that. Models drift, and a confident
 * fabrication reads exactly like a correct answer. So this file also defines
 * {@link verifyExplanation}: a deterministic check that a candidate explanation
 * only restates facts it was given. The caller runs it before anything reaches a
 * dentist and discards output that fails.
 *
 * The engine still contains no LLM client and performs no I/O — this file is the
 * contract plus its verifier. The provider adapter lives in the application
 * layer (`lib/ai`), the same split used for the metrics repository.
 */

import { BaseEngine } from "../core";
import type { Diagnosis } from "../domain";

/**
 * Everything the explainer is allowed to know.
 *
 * Deliberately closed: anything not in here cannot legitimately appear in the
 * explanation, which is what makes verification possible at all.
 */
export interface AIExplanationEngineInput {
  /** The diagnosis being explained. */
  readonly diagnosis: Diagnosis;
  /**
   * Plain statements of fact already established by the engines — typically the
   * descriptions of the signals behind this diagnosis, plus its evidence notes.
   */
  readonly facts: readonly string[];
}

export interface AIExplanationEngineOutput {
  /** Two or three short sentences a dentist can read at a glance. */
  readonly text: string;
}

/** Why a candidate explanation was rejected. */
export const ExplanationViolation = {
  /** Contains a figure that appears nowhere in the supplied facts. */
  UNSUPPORTED_NUMBER: "unsupported_number",
  /** Tells the reader what to do. Recommendations are a later phase's job. */
  ADVISORY_LANGUAGE: "advisory_language",
  /** Empty, or long enough that it is editorialising rather than restating. */
  LENGTH_OUT_OF_RANGE: "length_out_of_range",
} as const;
export type ExplanationViolation =
  (typeof ExplanationViolation)[keyof typeof ExplanationViolation];

export interface ExplanationVerification {
  readonly ok: boolean;
  readonly violations: readonly { code: ExplanationViolation; detail: string }[];
}

/**
 * Advisory verbs, kept aligned with the corpus in
 * `engines/diagnosis/__tests__/no-advice.spec.ts`: if the engine may not advise,
 * neither may the layer that speaks for it.
 */
const ADVISORY_PATTERNS: readonly RegExp[] = [
  /\bshould\b/i,
  /\bconsider\b/i,
  /\brecommend(s|ed|ing|ation|ations)?\b/i,
  /\btry\b/i,
  /\bneed to\b/i,
  /\bmust\b/i,
  /\bought to\b/i,
  /\bsuggest(s|ed|ing|ion|ions)?\b/i,
  /\badvis(e|es|ed|ing|able)\b/i,
];

/** Upper bound on an explanation, in characters. Three sentences is plenty. */
const MAX_EXPLANATION_CHARS = 600;

/**
 * Every number mentioned in a piece of text, normalised so "INR 67,000",
 * "67000" and "67,000" all compare equal.
 *
 * Percentages keep their value ("12.50%" -> "12.5"), because a percentage absent
 * from the source facts is exactly the invention this guard exists to catch.
 */
function numbersIn(text: string): string[] {
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches.map((raw) => {
    const n = Number(raw.replace(/,/g, ""));
    return Number.isFinite(n) ? String(n) : raw;
  });
}

/**
 * Verify that a candidate explanation only restates the facts it was given.
 *
 * Pure and deterministic — no model, no clock, no I/O. Reports every violation
 * rather than the first, so a caller can log precisely why a generation was
 * rejected.
 *
 * The number check is the load-bearing one. A model asked to simplify will
 * happily round, re-derive or invent a figure, and a wrong number in a financial
 * summary is worse than no summary at all.
 */
export function verifyExplanation(
  text: string,
  input: AIExplanationEngineInput,
): ExplanationVerification {
  const violations: { code: ExplanationViolation; detail: string }[] = [];
  const trimmed = text.trim();

  if (trimmed.length === 0 || trimmed.length > MAX_EXPLANATION_CHARS) {
    violations.push({
      code: ExplanationViolation.LENGTH_OUT_OF_RANGE,
      detail: `${trimmed.length} characters (allowed 1-${MAX_EXPLANATION_CHARS})`,
    });
  }

  for (const pattern of ADVISORY_PATTERNS) {
    const hit = trimmed.match(pattern);
    if (hit) {
      violations.push({
        code: ExplanationViolation.ADVISORY_LANGUAGE,
        detail: `contains "${hit[0]}"`,
      });
    }
  }

  // Every figure in the explanation must be traceable to the source material.
  const permitted = new Set([
    ...numbersIn(input.diagnosis.title),
    ...numbersIn(input.diagnosis.summary),
    ...input.facts.flatMap(numbersIn),
    ...input.diagnosis.hypotheses.flatMap((h) => numbersIn(h.statement)),
    ...input.diagnosis.evidence.flatMap((e) => numbersIn(e.description)),
  ]);

  for (const n of numbersIn(trimmed)) {
    if (!permitted.has(n)) {
      violations.push({
        code: ExplanationViolation.UNSUPPORTED_NUMBER,
        detail: `"${n}" does not appear in the supplied facts`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Build the closed fact set for a diagnosis.
 *
 * Kept here rather than in the caller so the explainer's input and the verifier's
 * permitted set are derived from one definition and cannot drift apart.
 */
export function explanationInputFor(
  diagnosis: Diagnosis,
  signalDescriptions: readonly string[] = [],
): AIExplanationEngineInput {
  return {
    diagnosis,
    facts: [...signalDescriptions, ...diagnosis.evidence.map((e) => e.description)],
  };
}

export abstract class AIExplanationEngine extends BaseEngine<
  AIExplanationEngineInput,
  AIExplanationEngineOutput
> {
  readonly name = "AIExplanationEngine";
}
