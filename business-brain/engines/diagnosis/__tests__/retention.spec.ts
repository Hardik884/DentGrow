import { describe, expect, it } from "vitest";

import { DiagnosisPattern } from "../../../domain";
import { MetricKey } from "../../metrics/metric-ids";
import {
  diagnoseMetrics,
  diagnoseRun,
  evidenceFor,
  hypothesis,
  patternsOf,
  pick,
  statuses,
} from "./fixtures/diagnose-harness";
import {
  BASE_EROSION,
  DATE,
  HEALTHY,
  PRIOR,
  RECALL_FAILURE,
  metrics,
  run,
  shiftDate,
} from "./fixtures/run-fixtures";

describe("patient_base_erosion", () => {
  it("keeps both sides supported rather than collapsing to one", () => {
    const result = diagnoseMetrics(BASE_EROSION, { previous: PRIOR });
    const diagnosis = pick(result, DiagnosisPattern.PATIENT_BASE_EROSION);
    expect(statuses(diagnosis)).toEqual({
      acquisition_driven: "supported",
      retention_driven: "supported",
      external_demand: "undetermined",
    });
    expect(hypothesis(diagnosis, "external_demand").requiredData.length).toBe(2);
  });

  it("excludes the recall pattern when acquisition is also affected", () => {
    const result = diagnoseMetrics(BASE_EROSION, { previous: PRIOR });
    expect(patternsOf(result)).toContain(DiagnosisPattern.PATIENT_BASE_EROSION);
    expect(patternsOf(result)).not.toContain(DiagnosisPattern.RECALL_PROCESS_FAILURE);

    const trace = result.traces.find(
      (entry) => entry.step === DiagnosisPattern.RECALL_PROCESS_FAILURE,
    );
    expect(trace?.reasoning).toContain("is present, so the contraction is not localised");
  });

  it("does not match without a prior period to compare returning volume against", () => {
    expect(patternsOf(diagnoseMetrics(BASE_EROSION))).not.toContain(
      DiagnosisPattern.PATIENT_BASE_EROSION,
    );
  });
});

describe("recall_process_failure", () => {
  it("localises to retention when acquisition is measurably unaffected", () => {
    const result = diagnoseMetrics(RECALL_FAILURE, { previous: PRIOR });
    const diagnosis = pick(result, DiagnosisPattern.RECALL_PROCESS_FAILURE);
    expect(statuses(diagnosis)).toEqual({
      recall_execution: "supported",
      acquisition_driven: "contradicted",
      contact_reachability: "undetermined",
      patient_choice: "undetermined",
    });
    expect(evidenceFor(diagnosis, "discrimination.recall-localisation")).toContain(
      "measurably unaffected",
    );
    expect(patternsOf(result)).not.toContain(DiagnosisPattern.PATIENT_BASE_EROSION);
  });

  it("refuses to claim localisation when the acquisition evaluator could not run", () => {
    // Drop the new-patient metric: its evaluator skips, so acquisition is unknown
    // rather than measured as healthy.
    const withoutNewPatients = { ...RECALL_FAILURE };
    delete withoutNewPatients[MetricKey.PATIENTS_NEW_TODAY];

    const result = diagnoseMetrics(withoutNewPatients, { previous: PRIOR });
    const diagnosis = pick(result, DiagnosisPattern.RECALL_PROCESS_FAILURE);
    expect(statuses(diagnosis)).toMatchObject({
      recall_execution: "undetermined",
      acquisition_driven: "undetermined",
    });
    expect(evidenceFor(diagnosis, "discrimination.recall-localisation")).toContain(
      "NOT measurably unaffected",
    );
    expect(hypothesis(diagnosis, "recall_execution").supporting[0].description).toContain(
      "did not reach a verdict (skipped)",
    );
  });

  it("caps diagnosis confidence at the weakest contributing signal", () => {
    // Three prior days, so persistence is classified and no history penalty
    // applies: the only thing that can reduce confidence is the signal cap.
    const history = [-3, -2, -1].map((offset) =>
      run(RECALL_FAILURE, {
        date: shiftDate(DATE, offset),
        previous: metrics(PRIOR, { date: shiftDate(DATE, offset - 1) }),
      }),
    );
    const complete = pick(
      diagnoseRun(run(RECALL_FAILURE, { previous: metrics(PRIOR, { date: "2026-07-25" }) }), {
        history,
      }),
      DiagnosisPattern.RECALL_PROCESS_FAILURE,
    );
    expect(complete.confidence).toBe(1);

    // The follow-up evaluator loses confidence without its optional metric, and
    // that cap carries through to the diagnosis however complete the pattern is.
    const partial = { ...RECALL_FAILURE };
    delete partial[MetricKey.FOLLOWUPS_DUE_TODAY];
    const partialRun = run(partial, {
      previous: metrics(PRIOR, { date: "2026-07-25" }),
    });
    const capped = pick(
      diagnoseRun(partialRun, { history }),
      DiagnosisPattern.RECALL_PROCESS_FAILURE,
    );

    const weakest = Math.min(
      ...capped.signalIds.map(
        (id) => partialRun.signals.find((s) => s.id === id)?.confidence ?? 1,
      ),
    );
    expect(weakest).toBe(0.9);
    expect(capped.confidence).toBe(0.9);
    expect(capped.confidence).toBeLessThan(complete.confidence);
    expect(evidenceFor(capped, "confidence")).toContain("capped at weakest");
  });

  it("does not match a healthy clinic", () => {
    const result = diagnoseRun(
      run(HEALTHY, { previous: metrics(PRIOR, { date: "2026-07-25" }) }),
    );
    expect(patternsOf(result)).not.toContain(DiagnosisPattern.RECALL_PROCESS_FAILURE);
  });
});
