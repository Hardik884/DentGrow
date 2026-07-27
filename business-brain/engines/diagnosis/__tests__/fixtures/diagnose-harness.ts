/**
 * Helpers for exercising the Diagnosis Engine against real signal runs.
 */

import type { Diagnosis, DiagnosisPattern, Hypothesis } from "../../../../domain";
import type { MetricsOnlyDay, SignalRun } from "../../../diagnosis-engine";
import type { DeepPartial, DiagnosisConfig } from "../../config/diagnosis-config";
import { evaluateDiagnoses, type DiagnosisEvaluationResult } from "../../diagnose";
import { CLINIC_ID, NOW, run, shiftDate, type MetricValues } from "./run-fixtures";

/** Diagnose a single day with optional history. */
export function diagnoseRun(
  current: SignalRun,
  options?: {
    history?: readonly SignalRun[];
    historyMetricsOnly?: readonly MetricsOnlyDay[];
    config?: DeepPartial<DiagnosisConfig>;
    clinicId?: string;
  },
): DiagnosisEvaluationResult {
  return evaluateDiagnoses({
    current,
    history: options?.history,
    historyMetricsOnly: options?.historyMetricsOnly,
    clinicId: options?.clinicId ?? CLINIC_ID,
    now: NOW,
    config: options?.config,
  });
}

/** Diagnose a metric map directly, with an optional prior period for trends. */
export function diagnoseMetrics(
  values: MetricValues,
  options?: {
    previous?: MetricValues;
    history?: readonly SignalRun[];
    historyMetricsOnly?: readonly MetricsOnlyDay[];
    config?: DeepPartial<DiagnosisConfig>;
  },
): DiagnosisEvaluationResult {
  return diagnoseRun(run(values, { previous: options?.previous }), options);
}

/** Patterns emitted, in output order. */
export function patternsOf(result: DiagnosisEvaluationResult): string[] {
  return result.diagnoses.map((diagnosis) => diagnosis.pattern);
}

/** The diagnosis for a pattern, or a descriptive failure. */
export function pick(
  result: DiagnosisEvaluationResult,
  pattern: DiagnosisPattern,
): Diagnosis {
  const found = result.diagnoses.find((diagnosis) => diagnosis.pattern === pattern);
  if (!found) {
    throw new Error(
      `expected a ${pattern} diagnosis, got [${patternsOf(result).join(", ")}]`,
    );
  }
  return found;
}

/** The hypothesis with a given slug, or a descriptive failure. */
export function hypothesis(diagnosis: Diagnosis, slug: string): Hypothesis {
  const found = diagnosis.hypotheses.find((item) => item.id.endsWith(`#h.${slug}`));
  if (!found) {
    throw new Error(
      `expected hypothesis "${slug}" on ${diagnosis.id}, got [${diagnosis.hypotheses
        .map((item) => item.id.split("#h.")[1])
        .join(", ")}]`,
    );
  }
  return found;
}

/** Hypothesis slug -> status, for compact assertions. */
export function statuses(diagnosis: Diagnosis): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of diagnosis.hypotheses) {
    out[item.id.split("#h.")[1]] = item.status;
  }
  return out;
}

/** Discriminator slugs attached to a diagnosis. */
export function discriminatorSlugs(diagnosis: Diagnosis): string[] {
  return diagnosis.discriminators.map((item) => item.id.split("#d.")[1]);
}

/** Evidence description matching a slug suffix. */
export function evidenceFor(diagnosis: Diagnosis, slug: string): string {
  const found = diagnosis.evidence.find((item) => item.id.endsWith(`#${slug}`));
  if (!found) {
    throw new Error(
      `expected evidence "${slug}" on ${diagnosis.id}, got [${diagnosis.evidence
        .map((item) => item.id.split("#")[1])
        .join(", ")}]`,
    );
  }
  return found.description;
}

/**
 * Build a history window of consecutive days, ending the day before `DATE`.
 * `days` are supplied oldest-first.
 */
export function historyOf(
  entries: readonly { readonly offset: number; readonly values: MetricValues }[],
  options?: { readonly previous?: MetricValues },
): SignalRun[] {
  return entries
    .map((entry) =>
      run(entry.values, {
        date: shiftDate("2026-07-26", entry.offset),
        previous: options?.previous,
      }),
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
