/**
 * Business Brain — Signal Engine: signal assembly
 *
 * One place that turns "this threshold was broken" into a fully formed Signal:
 * stable id, severity, priority, confidence, evidence, related entity.
 *
 * Ids are deterministic slugs (`signal.<type>:<clinicId>:<date>`) so re-running
 * a day overwrites rather than duplicates.
 */

import { EntityType, type Signal, type SignalCategory, type SignalType } from "../../../domain";
import { MetricUnit } from "../../../domain";
import type { Metric } from "../../../domain";
import type { Evidence } from "../../../types";
import type { EvaluatorContext, EvaluatorOutcome } from "../evaluators/types";
import { computeConfidence, countStaleMetrics } from "./confidence";
import {
  buildEvidence,
  formatMeasurement,
  formatValue,
  type Measurement,
} from "./evidence";
import { assessBreach, type BreachAssessment, type ThresholdDirection } from "./severity";

/** Deterministic id for a signal of a given type on a given clinic-day. */
export function signalId(type: SignalType, clinicId: string, date: string): string {
  return `signal.${type}:${clinicId}:${date}`;
}

/** A threshold a measurement was compared against. */
export interface ThresholdSpec extends Measurement {
  readonly direction: ThresholdDirection;
}

/** Everything an evaluator must supply to raise a threshold-based signal. */
export interface ThresholdSignalSpec {
  readonly type: SignalType;
  readonly category: SignalCategory;
  readonly title: string;
  /** Factual restatement of the observation. No advice, no causes. */
  readonly description: string;
  /** The measurement that broke the threshold. */
  readonly observed: Measurement;
  /** The threshold it broke. */
  readonly threshold: ThresholdSpec;
  /** Metrics the evaluator actually read, reported as `metricIds`. */
  readonly metricsRead: readonly Metric[];
  /**
   * Subset of `metricsRead` that is expected to describe `ctx.date`, used for
   * the staleness check. Trend evaluators pass only their current-period
   * metrics, because a prior-period metric describing another day is the point
   * of the comparison rather than a data problem. Defaults to `metricsRead`.
   */
  readonly currentPeriodMetrics?: readonly Metric[];
  /** Raw inputs behind any derived value in `observed`. */
  readonly inputs?: readonly Measurement[];
  /** The denominator the observation rests on, when it has one. */
  readonly denominator?: number;
  /** Declared optional metrics that were absent. */
  readonly missingOptionalMetrics?: number;
  /** Pre-computed assessment, for signals with two trigger branches. */
  readonly assessment?: BreachAssessment;
  /** Extra measurement evidence, e.g. the prior-period baseline. */
  readonly extraEvidence?: readonly { readonly slug: string; readonly description: string; readonly data?: unknown }[];
}

/**
 * Assemble a signal from a broken threshold, or report it as suppressed when
 * data completeness falls below the configured minimum.
 */
export function buildThresholdSignal(
  ctx: EvaluatorContext,
  spec: ThresholdSignalSpec,
): EvaluatorOutcome {
  const assessment =
    spec.assessment ??
    assessBreach({
      value: spec.observed.value,
      threshold: spec.threshold.value,
      direction: spec.threshold.direction,
      type: spec.type,
      config: ctx.config,
    });

  const staleMetrics = countStaleMetrics(
    spec.currentPeriodMetrics ?? spec.metricsRead,
    ctx.date,
  );
  const { confidence, deductions } = computeConfidence({
    config: ctx.config,
    missingOptionalMetrics: spec.missingOptionalMetrics,
    denominator: spec.denominator,
    staleMetrics,
  });

  if (confidence < ctx.config.confidence.minimumToEmit) {
    return {
      kind: "no_signal",
      reason: `suppressed: confidence ${confidence} below minimum ${ctx.config.confidence.minimumToEmit} (${deductions.join("; ")}).`,
    };
  }

  const id = signalId(spec.type, ctx.clinicId, ctx.date);
  const evidence: Evidence[] = [
    buildEvidence({
      signalId: id,
      slug: "observed",
      description: formatMeasurement(spec.observed),
      capturedAt: ctx.now,
      data: { ...spec.observed },
    }),
    buildEvidence({
      signalId: id,
      slug: "threshold",
      description: `${spec.threshold.label} = ${formatValue(spec.threshold.value, spec.threshold.unit)} (${spec.threshold.direction} bound)`,
      capturedAt: ctx.now,
      data: { ...spec.threshold },
    }),
  ];

  if (spec.inputs && spec.inputs.length > 0) {
    evidence.push(
      buildEvidence({
        signalId: id,
        slug: "inputs",
        description: spec.inputs.map(formatMeasurement).join("; "),
        capturedAt: ctx.now,
        data: spec.inputs.map((input) => ({ ...input })),
      }),
    );
  }

  for (const extra of spec.extraEvidence ?? []) {
    evidence.push(
      buildEvidence({
        signalId: id,
        slug: extra.slug,
        description: extra.description,
        capturedAt: ctx.now,
        data: extra.data,
      }),
    );
  }

  evidence.push(
    buildEvidence({
      signalId: id,
      slug: "breach",
      description: `Breach magnitude = ${formatValue(assessment.breach, MetricUnit.RATIO)} (${assessment.scale}) -> ${assessment.severity}`,
      capturedAt: ctx.now,
      data: {
        breach: assessment.breach,
        scale: assessment.scale,
        bandSeverity: assessment.bandSeverity,
        severity: assessment.severity,
      },
    }),
    buildEvidence({
      signalId: id,
      slug: "confidence",
      description:
        deductions.length === 0
          ? `Data completeness = ${confidence} (no deductions)`
          : `Data completeness = ${confidence} (${deductions.join("; ")})`,
      capturedAt: ctx.now,
      data: { confidence, deductions },
    }),
  );

  const signal: Signal = {
    id,
    title: spec.title,
    description: spec.description,
    severity: assessment.severity,
    priority: assessment.priority,
    category: spec.category,
    relatedEntities: [{ type: EntityType.CLINIC, id: ctx.clinicId }],
    metricIds: spec.metricsRead.map((metric) => metric.id),
    generatedAt: ctx.now,
    confidence,
    evidence,
  };

  return { kind: "signal", signal };
}
