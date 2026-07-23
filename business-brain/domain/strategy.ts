/**
 * Business Brain — Domain: Strategy
 *
 * The recommended approach to solve a constraint. Example — Constraint: "Low
 * treatment acceptance" → Strategy: "Prioritize pending high-value treatment
 * follow-ups". A Strategy is direction, not the individual tasks (those are
 * Actions).
 */

import type { Priority } from "../types";
import type { ValueType } from "./value";

/**
 * A recommended approach for resolving a constraint.
 */
export interface Strategy {
  /** Stable identifier for this strategy. */
  readonly id: string;
  /** Short title (e.g. "Prioritize high-value follow-ups"). */
  readonly title: string;
  /** Fuller description of the recommended approach. */
  readonly description: string;
  /** Id of the constraint this strategy addresses. */
  readonly constraintId: string;
  /** How important this strategy is relative to others. */
  readonly priority: Priority;
  /** Optional kinds of value this strategy is expected to produce. */
  readonly expectedValueTypes?: readonly ValueType[];
  /** ISO-8601 timestamp of when the strategy was recommended. */
  readonly createdAt: string;
}
