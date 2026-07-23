/**
 * Business Brain — Domain: Learning
 *
 * Knowledge captured after actions complete (e.g. "Reminders after 3 days
 * perform better than 7 days", "Morning calls have higher response rates").
 * This is the model only — no learning logic lives here.
 */

import type { Confidence, Evidence } from "../types";

/**
 * A single captured insight that can inform future decisions.
 */
export interface Learning {
  /** Stable identifier for this insight. */
  readonly id: string;
  /** The captured insight, in plain language. */
  readonly insight: string;
  /** Evidence backing the insight. */
  readonly evidence: readonly Evidence[];
  /** How confident we are in the insight, in [0, 1]. */
  readonly confidence: Confidence;
  /** Ids of the actions/outcomes this insight was learned from. */
  readonly relatedActionIds?: readonly string[];
  /** ISO-8601 timestamp of when the insight was captured. */
  readonly capturedAt: string;
}
