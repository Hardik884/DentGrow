/**
 * The no-advice invariant, as an executable test rather than a review convention.
 *
 * Diagnosis states what was measured and what the measurements do and do not
 * separate. The moment it says "consider", "should", or "recommend", it has become
 * a recommendation engine — which is a later phase with its own constraints,
 * ranking, and accountability. This test scans every string the engine emits
 * across the whole fixture corpus and fails on advisory vocabulary.
 *
 * Describing a mechanism is allowed ("cancellations are concentrated in a subset of
 * slots"). Prescribing an action is not ("call patients the day before").
 */

import { describe, expect, it } from "vitest";

import type { Diagnosis } from "../../../domain";
import { ALL_DISCRIMINATORS } from "../support/discriminators";
import { diagnoseRun } from "./fixtures/diagnose-harness";
import {
  ATTRITION_BALANCED,
  ATTRITION_CANCELLATION_DOMINANT,
  ATTRITION_NO_SHOW_DOMINANT,
  BASE_EROSION,
  COLLECTION_GAP,
  CONGESTION_CAPACITY_BOUND,
  CONGESTION_FLOW_BOUND,
  CONTRADICTORY,
  DATE,
  DEMAND_SUPPLY_NO_PENDING,
  DEMAND_SUPPLY_WITH_PENDING,
  HEALTHY,
  ISOLATED_SIGNAL,
  PRIOR,
  RECALL_FAILURE,
  REVENUE_AMBIGUOUS,
  REVENUE_VOLUME_DRIVEN,
  REVENUE_YIELD_DRIVEN,
  run,
  shiftDate,
  type MetricValues,
} from "./fixtures/run-fixtures";

/**
 * Advisory vocabulary. Word-bounded so "consideration" and "trying" are not false
 * positives, and so "must" in a factual clause is still caught — the engine has no
 * business using it either way.
 */
const ADVISORY = [
  /\bshould\b/i,
  /\bconsider\b/i,
  /\brecommend(s|ed|ation|ations)?\b/i,
  /\btry\b/i,
  /\bneed to\b/i,
  /\bmust\b/i,
  /\bought to\b/i,
  /\bsuggest(s|ed|ion|ions)?\b/i,
  /\badvis(e|es|ed|able)\b/i,
];

const CORPUS: readonly { readonly name: string; readonly values: MetricValues }[] = [
  { name: "healthy", values: HEALTHY },
  { name: "isolated signal", values: ISOLATED_SIGNAL },
  { name: "demand/supply with pending", values: DEMAND_SUPPLY_WITH_PENDING },
  { name: "demand/supply without pending", values: DEMAND_SUPPLY_NO_PENDING },
  { name: "revenue yield-driven", values: REVENUE_YIELD_DRIVEN },
  { name: "revenue volume-driven", values: REVENUE_VOLUME_DRIVEN },
  { name: "revenue ambiguous", values: REVENUE_AMBIGUOUS },
  { name: "congestion capacity-bound", values: CONGESTION_CAPACITY_BOUND },
  { name: "congestion flow-bound", values: CONGESTION_FLOW_BOUND },
  { name: "attrition cancellation-dominant", values: ATTRITION_CANCELLATION_DOMINANT },
  { name: "attrition no-show-dominant", values: ATTRITION_NO_SHOW_DOMINANT },
  { name: "attrition balanced", values: ATTRITION_BALANCED },
  { name: "collection gap", values: COLLECTION_GAP },
  { name: "patient base erosion", values: BASE_EROSION },
  { name: "recall failure", values: RECALL_FAILURE },
  { name: "contradictory signals", values: CONTRADICTORY },
];

/** Every human-readable string a diagnosis exposes. */
function stringsOf(diagnosis: Diagnosis): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [
    { where: `${diagnosis.id} title`, text: diagnosis.title },
    { where: `${diagnosis.id} summary`, text: diagnosis.summary },
  ];
  for (const evidence of diagnosis.evidence) {
    out.push({ where: `${evidence.id} evidence`, text: evidence.description });
  }
  for (const hypothesis of diagnosis.hypotheses) {
    out.push({ where: `${hypothesis.id} statement`, text: hypothesis.statement });
    for (const item of [...hypothesis.supporting, ...hypothesis.contradicting]) {
      out.push({ where: `${item.id} evidence`, text: item.description });
    }
    for (const required of hypothesis.requiredData) {
      out.push({ where: `${hypothesis.id} requiredData`, text: required });
    }
  }
  for (const discriminator of diagnosis.discriminators) {
    out.push({
      where: `${discriminator.id} description`,
      text: discriminator.description,
    });
  }
  return out;
}

function offences(texts: readonly { where: string; text: string }[]): string[] {
  const found: string[] = [];
  for (const { where, text } of texts) {
    for (const pattern of ADVISORY) {
      const match = pattern.exec(text);
      if (match) found.push(`${where}: "${match[0]}" in "${text}"`);
    }
  }
  return found;
}

describe("no-advice invariant", () => {
  it("emits no advisory vocabulary anywhere in the fixture corpus", () => {
    const history = [-3, -2, -1];
    const found: string[] = [];

    for (const scenario of CORPUS) {
      for (const withHistory of [false, true]) {
        const result = diagnoseRun(run(scenario.values, { previous: PRIOR }), {
          history: withHistory
            ? history.map((offset) =>
                run(scenario.values, { date: shiftDate(DATE, offset) }),
              )
            : undefined,
        });
        for (const diagnosis of result.diagnoses) {
          found.push(
            ...offences(stringsOf(diagnosis)).map(
              (offence) => `[${scenario.name}${withHistory ? " + history" : ""}] ${offence}`,
            ),
          );
        }
        // traces are part of the engine's output surface too
        found.push(
          ...offences(
            result.traces.map((entry) => ({
              where: `trace ${entry.step}`,
              text: entry.reasoning,
            })),
          ).map((offence) => `[${scenario.name}] ${offence}`),
        );
      }
    }

    expect(found).toEqual([]);
  });

  it("emits no advisory vocabulary in the discriminator catalogue", () => {
    expect(
      offences(
        ALL_DISCRIMINATORS.map((spec) => ({
          where: `discriminator ${spec.slug}`,
          text: spec.description,
        })),
      ),
    ).toEqual([]);
  });

  it("catches advisory vocabulary when it is present", () => {
    // Guards the guard: a scanner that never fires is not a test.
    expect(
      offences([
        { where: "sample", text: "Staff should call patients the day before." },
        { where: "sample", text: "Consider tightening the recall list." },
      ]),
    ).toHaveLength(2);
  });
});
