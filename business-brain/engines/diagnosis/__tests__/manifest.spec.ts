/**
 * Prints the consolidated discriminator manifest — the outstanding data
 * requirements this phase produced, grouped by what it would take to satisfy them.
 *
 * It is a test rather than a script so it cannot drift from the shipped catalogue:
 * it asserts every entry is reachable from a real matcher, and prints the manifest
 * as a side effect of proving that.
 */

import { describe, expect, it } from "vitest";

import { ALL_DISCRIMINATORS, Availability } from "../support/discriminators";
import { diagnoseRun } from "./fixtures/diagnose-harness";
import {
  ATTRITION_BALANCED,
  ATTRITION_CANCELLATION_DOMINANT,
  BASE_EROSION,
  COLLECTION_GAP,
  CONGESTION_CAPACITY_BOUND,
  CONGESTION_FLOW_BOUND,
  DATE,
  DEMAND_SUPPLY_NO_PENDING,
  DEMAND_SUPPLY_WITH_PENDING,
  ISOLATED_SIGNAL,
  PRIOR,
  RECALL_FAILURE,
  REVENUE_AMBIGUOUS,
  REVENUE_VOLUME_DRIVEN,
  REVENUE_YIELD_DRIVEN,
  run,
  shiftDate,
} from "./fixtures/run-fixtures";

const SCENARIOS = [
  DEMAND_SUPPLY_WITH_PENDING,
  DEMAND_SUPPLY_NO_PENDING,
  REVENUE_YIELD_DRIVEN,
  REVENUE_VOLUME_DRIVEN,
  REVENUE_AMBIGUOUS,
  CONGESTION_CAPACITY_BOUND,
  CONGESTION_FLOW_BOUND,
  ATTRITION_CANCELLATION_DOMINANT,
  ATTRITION_BALANCED,
  COLLECTION_GAP,
  BASE_EROSION,
  RECALL_FAILURE,
  ISOLATED_SIGNAL,
];

/** Discriminator slugs actually attached to a diagnosis across the corpus. */
function emittedSlugs(): Set<string> {
  const slugs = new Set<string>();
  for (const values of SCENARIOS) {
    for (const history of [undefined, [-3, -2, -1].map((offset) => run(values, { date: shiftDate(DATE, offset) }))]) {
      const result = diagnoseRun(run(values, { previous: PRIOR }), { history });
      for (const diagnosis of result.diagnoses) {
        for (const discriminator of diagnosis.discriminators) {
          slugs.add(discriminator.id.split("#d.")[1]);
        }
      }
    }
  }
  return slugs;
}

describe("discriminator manifest", () => {
  it("every catalogued discriminator is reachable from a real matcher", () => {
    const emitted = emittedSlugs();
    const unreachable = ALL_DISCRIMINATORS.filter((spec) => !emitted.has(spec.slug));
    expect(unreachable.map((spec) => spec.slug)).toEqual([]);
  });

  it("prints the consolidated manifest", () => {
    const groups: readonly Availability[] = [
      Availability.REQUIRES_ENTITY_DATA,
      Availability.REQUIRES_NEW_METRIC,
      Availability.REQUIRES_LONGER_HISTORY,
      Availability.AVAILABLE,
    ];
    const lines: string[] = ["", "CONSOLIDATED DISCRIMINATOR MANIFEST", ""];
    for (const group of groups) {
      const entries = ALL_DISCRIMINATORS.filter((spec) => spec.availability === group);
      lines.push(`${group} (${entries.length})`);
      for (const spec of entries) {
        lines.push(`  - ${spec.slug}${spec.portMethod ? `  ->  ${spec.portMethod}()` : ""}`);
      }
      lines.push("");
    }
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
    expect(ALL_DISCRIMINATORS.length).toBe(27);
  });
});
