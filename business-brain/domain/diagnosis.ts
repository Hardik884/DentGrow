/**
 * Business Brain — Domain: Diagnosis
 *
 * A Diagnosis answers exactly two questions about a set of signals:
 *
 *   1. Which of these observations are one story rather than several?
 *   2. What causes are consistent with the evidence, and what would
 *      distinguish them?
 *
 * It is NOT a recommendation. It never tells anyone what to do — that is a
 * later phase.
 *
 * The central discipline: a threshold breach is a fact, a cause is not. Nothing
 * in daily clinic metrics can separate "cancellations rose because reminders
 * stopped sending" from "cancellations rose because of a local flu outbreak".
 * So a Diagnosis never asserts a single cause. It carries every hypothesis the
 * evidence permits, each with an explicit status, plus an explicit list of what
 * measurement would discriminate between them.
 *
 * A diagnosis whose every hypothesis is `undetermined` is a correct, expected
 * output — not a failure.
 */

import type { Confidence, Evidence, Severity } from "../types";
import type { RelatedEntity } from "./shared";
import type { SignalCategory } from "./signal";

/**
 * The correlation patterns the engine can recognise. The string value is part
 * of every diagnosis id and must never be renamed casually.
 */
export const DiagnosisPattern = {
  DEMAND_SUPPLY_MISMATCH: "demand_supply_mismatch",
  SCHEDULE_ATTRITION: "schedule_attrition",
  COLLECTION_GAP: "collection_gap",
  PIPELINE_CONVERSION_FAILURE: "pipeline_conversion_failure",
  THROUGHPUT_CONGESTION: "throughput_congestion",
  PATIENT_BASE_EROSION: "patient_base_erosion",
  RECALL_PROCESS_FAILURE: "recall_process_failure",
  REVENUE_SHORTFALL: "revenue_shortfall",
  CAPACITY_CEILING: "capacity_ceiling",
  UNCLUSTERED_SIGNAL: "unclustered_signal",
} as const;

export type DiagnosisPattern = (typeof DiagnosisPattern)[keyof typeof DiagnosisPattern];

/**
 * How the pattern behaved across the supplied history window.
 *
 * `insufficient_history` is not a soft "probably transient" — it means the
 * engine was not given enough days to classify anything, and says so.
 */
export type Persistence =
  | "insufficient_history"
  | "transient"
  | "intermittent"
  | "sustained"
  | "worsening"
  | "improving";

/**
 * What the available evidence does to a hypothesis.
 *
 * - `supported`: evidence positively favours it.
 * - `contradicted`: evidence positively rules against it.
 * - `undetermined`: consistent with the data, and NOT distinguishable from the
 *   alternatives using what is available. This is the honest default.
 */
export type HypothesisStatus = "supported" | "contradicted" | "undetermined";

/** One candidate explanation for a pattern. */
export interface Hypothesis {
  /** Stable id, `<diagnosisId>#h.<slug>`. */
  readonly id: string;
  /** Factual and testable. Never advisory. */
  readonly statement: string;
  readonly status: HypothesisStatus;
  /**
   * Data completeness behind this hypothesis, never a probability that it is
   * true. Undetermined hypotheses are capped by configuration so they can never
   * present as high-confidence.
   */
  readonly confidence: Confidence;
  readonly supporting: Evidence[];
  readonly contradicting: Evidence[];
  /**
   * What measurements are missing. Empty if and only if the status is not
   * `undetermined`: a hypothesis the engine settled needs nothing further, and
   * a hypothesis it could not settle must say what it would take.
   */
  readonly requiredData: readonly string[];
}

/** A measurement that would separate two or more hypotheses. */
export interface Discriminator {
  /** Stable id, `<diagnosisId>#d.<slug>`. */
  readonly id: string;
  /** What measurement would separate the hypotheses, stated factually. */
  readonly description: string;
  /** Ids of the hypotheses this measurement would separate. */
  readonly wouldSeparate: readonly string[];
  /**
   * What it would take to obtain the measurement. The set of non-`available`
   * discriminators the engine produces is the specification for the next phase.
   */
  readonly availability:
    | "available"
    | "requires_entity_data"
    | "requires_new_metric"
    | "requires_data_capture"
    | "requires_longer_history";
}

/**
 * One correlated story, with competing explanations and no recommendation.
 *
 * Invariants (enforced in code and tests):
 * - `hypotheses` is never empty.
 * - if every hypothesis is `undetermined`, at least one discriminator is present.
 * - `summary` and every evidence description state measurements and logic only.
 */
export interface Diagnosis {
  /** Stable id, `diagnosis.<pattern>:<clinicId>:<date>`. */
  readonly id: string;
  readonly pattern: DiagnosisPattern;
  readonly title: string;
  /** Factual restatement of the correlated observations. Never advice. */
  readonly summary: string;
  readonly category: SignalCategory;
  readonly severity: Severity;
  /**
   * Data completeness and pattern completeness — never a probability that any
   * cause is correct. Capped by the weakest contributing signal.
   */
  readonly confidence: Confidence;
  readonly persistence: Persistence;
  /** Ids of the signals that contributed to this pattern. */
  readonly signalIds: readonly string[];
  readonly metricIds: readonly string[];
  readonly hypotheses: readonly Hypothesis[];
  readonly discriminators: readonly Discriminator[];
  /** Clinic-level only in this phase; entity drill-down is a later phase. */
  readonly relatedEntities: readonly RelatedEntity[];
  readonly evidence: Evidence[];
  /** ISO-8601, injected. The engine never reads the system clock. */
  readonly generatedAt: string;
}
