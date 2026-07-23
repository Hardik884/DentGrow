/**
 * Business Brain — Domain: Diagnosis
 *
 * The explanation behind one or more signals. A Diagnosis moves from "what is
 * happening" (signals) to "why it is happening", backed by evidence and a
 * confidence score.
 */

import type { Confidence, Evidence } from "../types";

/**
 * A reasoned explanation for a set of related signals.
 */
export interface Diagnosis {
  /** Stable identifier for this diagnosis. */
  readonly id: string;
  /** Concise, human-readable explanation of the root cause. */
  readonly summary: string;
  /** Evidence supporting the explanation. */
  readonly evidence: readonly Evidence[];
  /** How confident the diagnosis is, in [0, 1]. */
  readonly confidence: Confidence;
  /** Ids of the signals this diagnosis explains. */
  readonly relatedSignalIds: readonly string[];
  /** ISO-8601 timestamp of when the diagnosis was produced. */
  readonly generatedAt: string;
}
