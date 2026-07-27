import { describe, expect, it } from "vitest";

import { DiagnosisPattern } from "../../../domain";
import { MetricKey } from "../../metrics/metric-ids";
import {
  diagnoseMetrics,
  diagnoseRun,
  discriminatorSlugs,
  evidenceFor,
  hypothesis,
  patternsOf,
  pick,
  statuses,
} from "./fixtures/diagnose-harness";
import {
  COLLECTION_GAP,
  HEALTHY,
  REVENUE_AMBIGUOUS,
  REVENUE_VOLUME_DRIVEN,
  REVENUE_YIELD_DRIVEN,
  run,
} from "./fixtures/run-fixtures";

describe("revenue_shortfall", () => {
  it("is yield-driven when the work was delivered and the money was not collected", () => {
    const diagnosis = pick(
      diagnoseMetrics(REVENUE_YIELD_DRIVEN),
      DiagnosisPattern.REVENUE_SHORTFALL,
    );
    expect(statuses(diagnosis)).toEqual({
      yield: "supported",
      volume: "contradicted",
      case_mix: "undetermined",
    });
    expect(hypothesis(diagnosis, "yield").supporting[0].description).toContain(
      "collection-lagging-completions signal fired",
    );
  });

  it("is volume-driven when both work measurements are below threshold", () => {
    const diagnosis = pick(
      diagnoseMetrics(REVENUE_VOLUME_DRIVEN),
      DiagnosisPattern.REVENUE_SHORTFALL,
    );
    expect(statuses(diagnosis)).toEqual({
      volume: "supported",
      yield: "contradicted",
      case_mix: "undetermined",
    });
    expect(evidenceFor(diagnosis, "discrimination.volume-vs-yield")).toContain(
      "3 appointment(s) against threshold 5",
    );
  });

  it("leaves both undetermined when the two work measurements disagree", () => {
    const diagnosis = pick(
      diagnoseMetrics(REVENUE_AMBIGUOUS),
      DiagnosisPattern.REVENUE_SHORTFALL,
    );
    expect(statuses(diagnosis)).toEqual({
      volume: "undetermined",
      yield: "undetermined",
      case_mix: "undetermined",
    });
    expect(discriminatorSlugs(diagnosis)).toContain("delivered_work_volume");
    expect(hypothesis(diagnosis, "volume").supporting[0].description).toContain(
      "opposite directions",
    );
  });
});

describe("collection_gap", () => {
  it("is undetermined without enough history to tell a lag from a process", () => {
    const diagnosis = pick(
      diagnoseMetrics(COLLECTION_GAP),
      DiagnosisPattern.COLLECTION_GAP,
    );
    expect(diagnosis.persistence).toBe("insufficient_history");
    expect(statuses(diagnosis)).toEqual({
      billing_lag: "undetermined",
      systemic_process: "undetermined",
      patient_balances: "undetermined",
    });
    expect(discriminatorSlugs(diagnosis)).toContain("collection_lag_over_time");
  });

  it("supports a one-day billing lag when the window is otherwise clean", () => {
    const history = [
      run(HEALTHY, { date: "2026-07-23" }),
      run(HEALTHY, { date: "2026-07-24" }),
      run(HEALTHY, { date: "2026-07-25" }),
    ];
    const diagnosis = pick(
      diagnoseRun(run(COLLECTION_GAP), { history }),
      DiagnosisPattern.COLLECTION_GAP,
    );
    expect(diagnosis.persistence).toBe("transient");
    expect(statuses(diagnosis)).toMatchObject({
      billing_lag: "supported",
      systemic_process: "contradicted",
    });
  });

  it("supports a standing process when the gap repeats across the window", () => {
    const history = [
      run(COLLECTION_GAP, { date: "2026-07-23" }),
      run(COLLECTION_GAP, { date: "2026-07-24" }),
      run(COLLECTION_GAP, { date: "2026-07-25" }),
    ];
    const diagnosis = pick(
      diagnoseRun(run(COLLECTION_GAP), { history }),
      DiagnosisPattern.COLLECTION_GAP,
    );
    expect(["sustained", "worsening"]).toContain(diagnosis.persistence);
    expect(statuses(diagnosis)).toMatchObject({
      systemic_process: "supported",
      billing_lag: "contradicted",
    });
    expect(hypothesis(diagnosis, "systemic_process").supporting[0].description).toContain(
      "consecutive day",
    );
  });

  it("does not match when collection kept pace with completions", () => {
    expect(patternsOf(diagnoseMetrics(HEALTHY))).not.toContain(
      DiagnosisPattern.COLLECTION_GAP,
    );
  });

  it("counts the optional outstanding signals toward pattern completeness", () => {
    const withOutstanding = {
      ...COLLECTION_GAP,
      [MetricKey.REVENUE_OUTSTANDING]: 62_000,
    };
    const bare = pick(
      diagnoseMetrics(COLLECTION_GAP),
      DiagnosisPattern.COLLECTION_GAP,
    );
    const richer = pick(
      diagnoseMetrics(withOutstanding),
      DiagnosisPattern.COLLECTION_GAP,
    );
    expect(richer.confidence).toBeGreaterThan(bare.confidence);
  });
});
