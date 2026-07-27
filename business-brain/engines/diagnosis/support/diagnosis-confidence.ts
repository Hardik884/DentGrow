/**
 * Business Brain — Diagnosis Engine: confidence
 *
 * Diagnosis confidence measures DATA COMPLETENESS and PATTERN COMPLETENESS. It
 * is never a probability that any hypothesis is correct — that number does not
 * exist, and inventing one is the failure mode this whole engine is designed to
 * avoid. Hypothesis status carries the epistemic claim; confidence carries only
 * "how much of the picture did we actually get to see".
 *
 * The cap is the important part: a diagnosis can never be more confident than
 * its weakest constituent signal. Correlating three observations cannot make any
 * of them better measured than it was.
 */

import { clamp, round2 } from "../../signals/support/numbers";
import type { Confidence } from "../../../types";
import type { Persistence } from "../../../domain";
import type { DiagnosisConfig } from "../config/diagnosis-config";

export interface DiagnosisConfidenceInput {
  readonly config: DiagnosisConfig;
  /** Declared optional signals for the pattern. */
  readonly optionalDeclared: number;
  /** How many of them were present. */
  readonly optionalPresent: number;
  /** Confidence of every contributing signal. */
  readonly contributingConfidences: readonly (number | undefined)[];
  readonly persistence: Persistence;
  /** History days whose state was unknown rather than known. */
  readonly unknownHistoryDays: number;
  /**
   * Required-signal evaluators that SKIPPED for missing data. A required signal
   * that returned `no_signal` costs nothing: measured absence is information.
   */
  readonly skippedRequiredEvaluators: number;
}

export interface DiagnosisConfidenceAssessment {
  readonly confidence: Confidence;
  /** Reasons confidence was reduced, for evidence and trace. */
  readonly deductions: readonly string[];
  /** The cap imposed by the weakest contributing signal, when one applied. */
  readonly signalCap?: number;
  readonly reasoning: string;
}

/** Compute a diagnosis's data-completeness confidence. */
export function computeDiagnosisConfidence(
  input: DiagnosisConfidenceInput,
): DiagnosisConfidenceAssessment {
  const rules = input.config.confidence;
  const deductions: string[] = [];

  const ratio =
    input.optionalDeclared === 0
      ? 1
      : input.optionalPresent / input.optionalDeclared;
  const factor =
    rules.optionalCompletenessFloor + (1 - rules.optionalCompletenessFloor) * ratio;
  let score = factor;
  if (ratio < 1) {
    deductions.push(
      `${input.optionalPresent} of ${input.optionalDeclared} optional signal(s) present (completeness factor ${round2(factor)})`,
    );
  }

  if (input.persistence === "insufficient_history") {
    score -= rules.missingHistoryPenalty;
    deductions.push(
      `no usable history window (-${rules.missingHistoryPenalty})`,
    );
  }

  if (input.unknownHistoryDays > 0) {
    score -= rules.unknownHistoryDayPenalty * input.unknownHistoryDays;
    deductions.push(
      `${input.unknownHistoryDays} history day(s) unknown (-${round2(rules.unknownHistoryDayPenalty * input.unknownHistoryDays)})`,
    );
  }

  if (input.skippedRequiredEvaluators > 0) {
    score -= rules.tracedSkipPenalty * input.skippedRequiredEvaluators;
    deductions.push(
      `${input.skippedRequiredEvaluators} required-signal evaluator(s) skipped for missing data (-${round2(rules.tracedSkipPenalty * input.skippedRequiredEvaluators)})`,
    );
  }

  const present = input.contributingConfidences.filter(
    (value): value is number => typeof value === "number",
  );
  const signalCap = present.length > 0 ? Math.min(...present) : undefined;
  if (signalCap !== undefined && score > signalCap) {
    deductions.push(`capped at weakest contributing signal confidence ${signalCap}`);
    score = signalCap;
  }

  const confidence = round2(clamp(score, rules.floor, 1));
  return {
    confidence,
    deductions,
    signalCap,
    reasoning:
      deductions.length === 0
        ? `Data and pattern completeness = ${confidence} (no deductions).`
        : `Data and pattern completeness = ${confidence} (${deductions.join("; ")}).`,
  };
}

/**
 * Confidence for one hypothesis.
 *
 * Settled hypotheses inherit the diagnosis confidence — the evidence that
 * settled them is exactly the evidence the diagnosis rests on. Undetermined
 * hypotheses are capped, because "consistent with the data and indistinguishable
 * from the alternatives" must never render as a confident claim.
 */
export function hypothesisConfidence(
  status: "supported" | "contradicted" | "undetermined",
  diagnosisConfidence: number,
  config: DiagnosisConfig,
): Confidence {
  if (status === "undetermined") {
    return round2(
      Math.min(diagnosisConfidence, config.confidence.undeterminedConfidenceCeiling),
    );
  }
  return round2(diagnosisConfidence);
}

/** Mean of a set of confidences, or undefined when the set is empty. */
export function meanOrUndefined(
  values: readonly (number | undefined)[],
): Confidence | undefined {
  const present = values.filter((value): value is number => typeof value === "number");
  if (present.length === 0) return undefined;
  return round2(present.reduce((sum, value) => sum + value, 0) / present.length);
}
