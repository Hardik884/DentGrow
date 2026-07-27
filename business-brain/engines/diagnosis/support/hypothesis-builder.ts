/**
 * Business Brain — Diagnosis Engine: hypothesis assembly
 *
 * Turns a matcher's declared candidate causes into `Hypothesis` objects with
 * stable ids, capped confidence, and the invariant enforced: an undetermined
 * hypothesis MUST say what data would settle it, and a settled hypothesis must
 * not pretend it still needs something.
 *
 * Statements are written by the matchers and must be factual and testable —
 * "Cancellations are concentrated in a subset of appointment slots", never
 * "Staff should call patients the day before".
 */

import type { Hypothesis, HypothesisStatus } from "../../../domain";
import type { Evidence } from "../../../types";
import type { DiagnosisConfig } from "../config/diagnosis-config";
import { hypothesisConfidence } from "./diagnosis-confidence";
import { DISCRIMINATORS, type DiscriminatorKey } from "./discriminators";

/** A measurement note attached to a hypothesis. */
export interface EvidenceNote {
  readonly slug: string;
  readonly description: string;
  readonly data?: unknown;
}

/** What a matcher declares about one candidate cause. */
export interface HypothesisSpec {
  /** Slug forming the id, `<diagnosisId>#h.<slug>`. */
  readonly slug: string;
  readonly statement: string;
  readonly status: HypothesisStatus;
  readonly supporting?: readonly EvidenceNote[];
  readonly contradicting?: readonly EvidenceNote[];
  /**
   * Catalogue keys naming what would settle this hypothesis. Required when the
   * status is `undetermined`, forbidden otherwise.
   */
  readonly requires?: readonly DiscriminatorKey[];
}

export const DIAGNOSIS_EVIDENCE_SOURCE = "DiagnosisEngine";

/** Build one evidence item with a stable id and the injected capture time. */
export function diagnosisEvidence(params: {
  readonly ownerId: string;
  readonly slug: string;
  readonly description: string;
  readonly capturedAt: string;
  readonly data?: unknown;
}): Evidence {
  return {
    id: `${params.ownerId}#${params.slug}`,
    source: DIAGNOSIS_EVIDENCE_SOURCE,
    description: params.description,
    data: params.data,
    capturedAt: params.capturedAt,
  };
}

/**
 * Assemble hypotheses for a diagnosis.
 *
 * Throws on an invariant violation. Matchers run inside the engine's isolation
 * boundary, so a malformed matcher becomes a traced non-match rather than a
 * failed run — and the invariant tests catch it before that ever ships.
 */
export function buildHypotheses(params: {
  readonly diagnosisId: string;
  readonly specs: readonly HypothesisSpec[];
  readonly diagnosisConfidence: number;
  readonly now: string;
  readonly config: DiagnosisConfig;
}): Hypothesis[] {
  if (params.specs.length === 0) {
    throw new Error(
      `Diagnosis ${params.diagnosisId} declared no hypotheses; a diagnosis without a candidate explanation is not a diagnosis.`,
    );
  }

  return params.specs.map((spec) => {
    const id = `${params.diagnosisId}#h.${spec.slug}`;
    const requires = spec.requires ?? [];

    if (spec.status === "undetermined" && requires.length === 0) {
      throw new Error(
        `Hypothesis ${id} is undetermined but names no required data. An undetermined hypothesis must state what would settle it.`,
      );
    }
    if (spec.status !== "undetermined" && requires.length > 0) {
      throw new Error(
        `Hypothesis ${id} is ${spec.status} yet names required data. Settled hypotheses carry no outstanding data requirement.`,
      );
    }

    return {
      id,
      statement: spec.statement,
      status: spec.status,
      confidence: hypothesisConfidence(
        spec.status,
        params.diagnosisConfidence,
        params.config,
      ),
      supporting: (spec.supporting ?? []).map((note) =>
        diagnosisEvidence({
          ownerId: id,
          slug: `supporting.${note.slug}`,
          description: note.description,
          capturedAt: params.now,
          data: note.data,
        }),
      ),
      contradicting: (spec.contradicting ?? []).map((note) =>
        diagnosisEvidence({
          ownerId: id,
          slug: `contradicting.${note.slug}`,
          description: note.description,
          capturedAt: params.now,
          data: note.data,
        }),
      ),
      requiredData: requires.map((key) => DISCRIMINATORS[key].description),
    };
  });
}
