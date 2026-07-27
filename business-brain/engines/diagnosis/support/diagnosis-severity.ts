/**
 * Business Brain — Diagnosis Engine: severity
 *
 * A thin wrapper over the Signal Engine's severity module — the band order and
 * the clamping logic are reused, not reimplemented, so the two engines can never
 * disagree about what "high" means.
 *
 * A diagnosis inherits the worst severity among its contributing signals, then
 * moves one band for persistence. The reasoning: the same breach that happened
 * once is a worse business fact when it has happened for three days running, and
 * a less bad one when it is receding.
 *
 * Priority is deliberately NOT derived here. Diagnosis has no priority field;
 * ranking belongs to a later phase.
 */

import type { DiagnosisPattern, Persistence } from "../../../domain";
import { Severity } from "../../../types";
import { SEVERITY_ORDER } from "../../signals/support/severity";
import type { DiagnosisConfig } from "../config/diagnosis-config";

/** How many bands each persistence class moves severity. */
const PERSISTENCE_SHIFT: Readonly<Record<Persistence, number>> = {
  worsening: 1,
  sustained: 1,
  improving: -1,
  transient: 0,
  intermittent: 0,
  insufficient_history: 0,
};

export interface DiagnosisSeverityAssessment {
  /** Worst severity among the contributing signals. */
  readonly base: Severity;
  /** Bands moved for persistence. */
  readonly shift: number;
  /** After the persistence shift, before the per-pattern clamp. */
  readonly adjusted: Severity;
  /** Final value after the per-pattern floor/ceiling clamp. */
  readonly severity: Severity;
  /** Whether the clamp changed the value. */
  readonly clamped: boolean;
  readonly reasoning: string;
}

function shiftSeverity(severity: Severity, bands: number): Severity {
  const index = SEVERITY_ORDER.indexOf(severity);
  const next = Math.min(Math.max(index + bands, 0), SEVERITY_ORDER.length - 1);
  return SEVERITY_ORDER[next];
}

/** Worst of a set of severities; `info` when the set is empty. */
export function worstSeverity(severities: readonly Severity[]): Severity {
  return severities.reduce<Severity>(
    (worst, current) =>
      SEVERITY_ORDER.indexOf(current) > SEVERITY_ORDER.indexOf(worst) ? current : worst,
    Severity.INFO,
  );
}

/** Derive a diagnosis severity, recording every step for the audit trail. */
export function assessDiagnosisSeverity(params: {
  readonly contributing: readonly Severity[];
  readonly persistence: Persistence;
  readonly pattern: DiagnosisPattern;
  readonly config: DiagnosisConfig;
}): DiagnosisSeverityAssessment {
  const base = worstSeverity(params.contributing);
  const shift = PERSISTENCE_SHIFT[params.persistence];
  const adjusted = shiftSeverity(base, shift);

  const override = params.config.severity.overrides?.[params.pattern];
  let index = SEVERITY_ORDER.indexOf(adjusted);
  if (override?.floor) index = Math.max(index, SEVERITY_ORDER.indexOf(override.floor));
  if (override?.ceiling) index = Math.min(index, SEVERITY_ORDER.indexOf(override.ceiling));
  const severity = SEVERITY_ORDER[index];

  const shiftText =
    shift === 0
      ? `persistence ${params.persistence} moves no band`
      : `persistence ${params.persistence} moves ${shift > 0 ? "up" : "down"} one band to ${adjusted}`;
  const clampText =
    severity === adjusted
      ? "no pattern clamp applied"
      : `pattern clamp for ${params.pattern} adjusted ${adjusted} to ${severity}`;

  return {
    base,
    shift,
    adjusted,
    severity,
    clamped: severity !== adjusted,
    reasoning: `Worst contributing signal severity ${base}; ${shiftText}; ${clampText}.`,
  };
}
