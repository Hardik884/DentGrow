/**
 * Business Brain — Diagnosis Engine: signal and trace index
 *
 * Lookup of signals by type, plus the thing that makes this engine possible:
 * classification of an ABSENT signal.
 *
 * "Utilization was low and the cancellation evaluator could not run" is a
 * materially different situation from "utilization was low and cancellations
 * were fine". The signal list cannot tell them apart — both are simply an
 * absence. Only the Signal Engine's decision trace preserves the difference,
 * which is why the trace is a required input to this engine rather than an
 * optional extra.
 */

import type { Signal, SignalType } from "../../../domain";
import type { DecisionTrace } from "../../../types";

/** Why a signal type is not present in a run. */
export const Absence = {
  /** The evaluator could not run: required metrics were missing. */
  SKIPPED: "skipped",
  /**
   * The evaluator ran and produced a signal that was then withheld for low data
   * completeness. Not evidence of absence — evidence of thin data.
   */
  SUPPRESSED: "suppressed",
  /** The evaluator ran and the condition genuinely did not hold. */
  NO_SIGNAL: "no_signal",
  /** No trace entry for this type at all: the evaluator was not registered. */
  UNTRACED: "untraced",
} as const;

export type Absence = (typeof Absence)[keyof typeof Absence];

/** Full classification of one absent signal type. */
export interface AbsenceInfo {
  readonly kind: Absence;
  /** The trace reasoning, quoted verbatim into evidence. */
  readonly reason: string;
  /**
   * Whether the absence is usable as positive evidence. True only for
   * `no_signal`: the other kinds mean "we do not know".
   */
  readonly informative: boolean;
}

/** Key-addressable view over one signal run and its trace. */
export interface SignalIndex {
  readonly all: readonly Signal[];
  /** The signal for a type, when it was emitted. */
  get(type: SignalType): Signal | undefined;
  has(type: SignalType): boolean;
  /** Which of these types were emitted, in the given order. */
  present(types: readonly SignalType[]): readonly Signal[];
  /** How an absent type came to be absent. */
  absence(type: SignalType): AbsenceInfo;
  /** Types emitted in this run, in canonical run order. */
  readonly types: readonly SignalType[];
}

/** Strip the `signal.` prefix and the `:clinic:date` suffix from a signal id. */
export function signalTypeOf(signal: Signal): SignalType {
  const head = signal.id.slice(0, signal.id.indexOf(":"));
  return head.replace(/^signal\./, "") as SignalType;
}

/** The clinic a signal id is scoped to, or null when it is not parseable. */
export function signalClinicOf(signal: Signal): string | null {
  const firstColon = signal.id.indexOf(":");
  if (firstColon < 0) return null;
  const rest = signal.id.slice(firstColon + 1);
  const secondColon = rest.indexOf(":");
  if (secondColon < 0) return null;
  return rest.slice(0, secondColon);
}

/** The breach magnitude the signal recorded, or null when it did not. */
export function breachMagnitudeOf(signal: Signal): number | null {
  const breach = (signal.evidence ?? []).find((item) => item.id.endsWith("#breach"));
  const data = breach?.data as { readonly breach?: unknown } | undefined;
  return typeof data?.breach === "number" && Number.isFinite(data.breach)
    ? data.breach
    : null;
}

function classify(reasoning: string): Absence {
  if (reasoning.startsWith("Skipped:")) return Absence.SKIPPED;
  if (reasoning.includes("suppressed:")) return Absence.SUPPRESSED;
  if (reasoning.startsWith("No signal:")) return Absence.NO_SIGNAL;
  return Absence.UNTRACED;
}

/**
 * Index a signal run.
 *
 * Unknown or retired signal types in the input are kept as-is rather than
 * rejected: a history day produced by an older Signal Engine must not break the
 * run. They simply match no pattern.
 */
export function buildSignalIndex(
  signals: readonly Signal[],
  trace: readonly DecisionTrace[],
): SignalIndex {
  const byType = new Map<SignalType, Signal>();
  const order: SignalType[] = [];
  for (const signal of signals) {
    const type = signalTypeOf(signal);
    if (byType.has(type)) continue;
    byType.set(type, signal);
    order.push(type);
  }

  const reasonByStep = new Map<string, string>();
  for (const entry of trace) {
    if (!reasonByStep.has(entry.step)) reasonByStep.set(entry.step, entry.reasoning);
  }

  return {
    all: signals,
    types: order,
    get: (type) => byType.get(type),
    has: (type) => byType.has(type),
    present: (types) =>
      types.map((type) => byType.get(type)).filter((s): s is Signal => s !== undefined),
    absence: (type) => {
      const reasoning = reasonByStep.get(type);
      if (reasoning === undefined) {
        return {
          kind: Absence.UNTRACED,
          reason: `No trace entry for ${type}; the evaluator did not run in this signal run.`,
          informative: false,
        };
      }
      const kind = classify(reasoning);
      return { kind, reason: reasoning, informative: kind === Absence.NO_SIGNAL };
    },
  };
}
