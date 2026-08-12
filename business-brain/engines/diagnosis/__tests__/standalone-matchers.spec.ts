/**
 * Specs for the three standalone single-signal matchers added to close the
 * coverage gaps the audit found: a lone acquisition shortfall, a standing
 * outstanding-balance book, and an overdue-recall backlog. Each is a real,
 * actionable finding on its own, so it must surface as its own diagnosis — and
 * flow through to the correct constraint category — rather than being dropped as
 * an unclustered signal.
 *
 * Each also GUARDS against double-reporting: when the richer multi-signal pattern
 * that already tells the same story is present (a fall in returning volume, or a
 * same-day collection gap), the standalone matcher stays silent.
 */

import { describe, expect, it } from "vitest";

import { deriveConstraints } from "../../constraint/constraint-engine";
import { ConstraintCategory, DiagnosisPattern } from "../../../domain";
import { diagnoseRun, patternsOf, pick } from "./fixtures/diagnose-harness";
import {
  BASE_EROSION,
  CLINIC_ID,
  DATE,
  DEMAND_SUPPLY_NO_PENDING,
  HEALTHY,
  HIGH_OUTSTANDING,
  NOW,
  PRIOR,
  RECALL_BACKLOG,
  RECALL_FAILURE,
  run,
} from "./fixtures/run-fixtures";

/** The constraint categories produced from a scenario's diagnoses. */
function categoriesOf(values: Parameters<typeof run>[0]) {
  const { diagnoses } = diagnoseRun(run(values, { previous: PRIOR }));
  return deriveConstraints(diagnoses, CLINIC_ID, DATE, NOW).constraints.map((c) => c.category);
}

describe("acquisition_shortfall", () => {
  it("fires on low new patients with returning volume steady, as an acquisition constraint", () => {
    // DEMAND_SUPPLY_NO_PENDING has new=0 and returning steady vs PRIOR.
    const result = diagnoseRun(run(DEMAND_SUPPLY_NO_PENDING, { previous: PRIOR }));
    expect(patternsOf(result)).toContain(DiagnosisPattern.ACQUISITION_SHORTFALL);
    const d = pick(result, DiagnosisPattern.ACQUISITION_SHORTFALL);
    expect(d.hypotheses).toHaveLength(1);
    expect(d.hypotheses[0].status).toBe("supported");
    expect(categoriesOf(DEMAND_SUPPLY_NO_PENDING)).toContain(ConstraintCategory.ACQUISITION);
  });

  it("stays silent when returning volume is also dropping (base erosion owns that)", () => {
    // BASE_EROSION drops both new AND returning, so patient_base_erosion tells it.
    const result = diagnoseRun(run(BASE_EROSION, { previous: PRIOR }));
    expect(patternsOf(result)).not.toContain(DiagnosisPattern.ACQUISITION_SHORTFALL);
    expect(patternsOf(result)).toContain(DiagnosisPattern.PATIENT_BASE_EROSION);
  });
});

describe("outstanding_receivables", () => {
  it("fires on a high standing balance, as a revenue-leakage constraint", () => {
    const result = diagnoseRun(run(HIGH_OUTSTANDING, { previous: PRIOR }));
    expect(patternsOf(result)).toContain(DiagnosisPattern.OUTSTANDING_RECEIVABLES);
    const d = pick(result, DiagnosisPattern.OUTSTANDING_RECEIVABLES);
    expect(d.hypotheses[0].status).toBe("supported");
    expect(categoriesOf(HIGH_OUTSTANDING)).toContain(ConstraintCategory.REVENUE_LEAKAGE);
  });

  it("does not fire for a healthy clinic under the outstanding limit", () => {
    const result = diagnoseRun(run(HEALTHY, { previous: PRIOR }));
    expect(patternsOf(result)).not.toContain(DiagnosisPattern.OUTSTANDING_RECEIVABLES);
  });
});

describe("recall_backlog", () => {
  it("fires on a standalone overdue backlog, as a retention constraint", () => {
    const result = diagnoseRun(run(RECALL_BACKLOG, { previous: PRIOR }));
    expect(patternsOf(result)).toContain(DiagnosisPattern.RECALL_BACKLOG);
    const d = pick(result, DiagnosisPattern.RECALL_BACKLOG);
    expect(d.hypotheses[0].status).toBe("supported");
    expect(categoriesOf(RECALL_BACKLOG)).toContain(ConstraintCategory.RETENTION);
  });

  it("stays silent when returning volume is dropping (recall process failure owns that)", () => {
    // RECALL_FAILURE has the backlog AND a returning drop.
    const result = diagnoseRun(run(RECALL_FAILURE, { previous: PRIOR }));
    expect(patternsOf(result)).not.toContain(DiagnosisPattern.RECALL_BACKLOG);
    expect(patternsOf(result)).toContain(DiagnosisPattern.RECALL_PROCESS_FAILURE);
  });
});
