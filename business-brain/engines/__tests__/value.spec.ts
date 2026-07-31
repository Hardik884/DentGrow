/**
 * Specs for the Value Engine.
 *
 * The temptation this engine exists to resist is projecting a return —
 * "recovering this would earn you ₹40,000" — which needs a number nothing here
 * measures, delivered in the same voice as the figures that were measured.
 *
 * So the tests are mostly about restraint: value is the size of the problem as
 * it stands, it is only reported where it was genuinely measured, and it is
 * never allowed to reorder urgency.
 */

import { describe, expect, it } from "vitest";

import type { Constraint, Metric } from "../../domain";
import { MetricKey, buildMetric } from "../metrics/metric-ids";
import { compareValueAtStake, deriveValues } from "../value";
import { deriveConstraints } from "../constraint";
import { proposeStrategies, StrategyKind } from "../strategy";
import type { Diagnosis, Hypothesis } from "../../domain";

const CLINIC = "c1";
const DATE = "2026-08-01";
const NOW = "2026-08-01T06:30:00.000Z";

function m(key: MetricKey, value: number): Metric {
  return buildMetric(key, value, CLINIC, DATE, NOW);
}

function constraint(category: Constraint["category"], severity: Constraint["severity"] = "high"): Constraint {
  return {
    id: `constraint.${category}:${CLINIC}:${DATE}`,
    name: `Constraint ${category}`,
    description: "One finding points here.",
    category,
    severity,
    relatedDiagnosisIds: ["dx"],
    identifiedAt: NOW,
  };
}

describe("sizing a bottleneck", () => {
  it("reports unpaid work as money", () => {
    const { byConstraint } = deriveValues(
      [constraint("revenue_leakage")],
      [m(MetricKey.REVENUE_OUTSTANDING, 42000)],
      NOW,
    );
    const value = byConstraint.get(constraint("revenue_leakage").id)?.[0];
    expect(value?.amount).toBe(42000);
    expect(value?.unit).toBe("currency");
    expect(value?.type).toBe("revenue_recovered");
  });

  it("reports planned, undelivered treatment as money", () => {
    const { byConstraint } = deriveValues(
      [constraint("treatment_acceptance")],
      [m(MetricKey.REVENUE_PENDING_TREATMENT_VALUE, 80000)],
      NOW,
    );
    expect(byConstraint.get(constraint("treatment_acceptance").id)?.[0].amount).toBe(80000);
  });

  it("sums the parts of a bottleneck measured by more than one metric", () => {
    const { byConstraint } = deriveValues(
      [constraint("scheduling")],
      [
        m(MetricKey.APPOINTMENTS_CANCELLED_TODAY, 3),
        m(MetricKey.APPOINTMENTS_NO_SHOWS_TODAY, 2),
      ],
      NOW,
    );
    expect(byConstraint.get(constraint("scheduling").id)?.[0].amount).toBe(5);
  });

  it("reports idle capacity as the time that went UNUSED, not the time opened", () => {
    // 480 minutes open at 25% utilization leaves 360 idle. Reporting the 480
    // would describe the day rather than the problem.
    const { byConstraint } = deriveValues(
      [constraint("capacity")],
      [
        m(MetricKey.CAPACITY_OPEN_MINUTES_TODAY, 480),
        m(MetricKey.CAPACITY_CHAIR_UTILIZATION, 25),
      ],
      NOW,
    );
    const value = byConstraint.get(constraint("capacity").id)?.[0];
    expect(value?.amount).toBe(360);
    expect(value?.unit).toBe("minutes");
  });

  it("reports idle capacity as zero when the chairs were full", () => {
    const { byConstraint } = deriveValues(
      [constraint("capacity")],
      [
        m(MetricKey.CAPACITY_OPEN_MINUTES_TODAY, 480),
        m(MetricKey.CAPACITY_CHAIR_UTILIZATION, 100),
      ],
      NOW,
    );
    expect(byConstraint.get(constraint("capacity").id)?.[0].amount).toBe(0);
  });
});

describe("refusing to invent", () => {
  it("says plainly that the figure is present size, not projected gain", () => {
    // The one misreading that would turn an honest number into a promise.
    const { byConstraint } = deriveValues(
      [constraint("revenue_leakage")],
      [m(MetricKey.REVENUE_OUTSTANDING, 42000)],
      NOW,
    );
    expect(byConstraint.get(constraint("revenue_leakage").id)?.[0].description).toContain(
      "not an estimate of what acting would recover",
    );
  });

  it("leaves a bottleneck UNSIZED when its metric is missing", () => {
    // Zero would read as "nothing at stake here" and push a genuine problem down
    // any ranking that used it.
    const { byConstraint } = deriveValues([constraint("revenue_leakage")], [], NOW);
    expect(byConstraint.has(constraint("revenue_leakage").id)).toBe(false);
  });

  it("refuses a partial sum when only some contributing metrics are present", () => {
    // Half of "cancellations plus no-shows" would understate the loss while
    // looking like a complete measurement.
    const { byConstraint } = deriveValues(
      [constraint("scheduling")],
      [m(MetricKey.APPOINTMENTS_CANCELLED_TODAY, 3)],
      NOW,
    );
    expect(byConstraint.has(constraint("scheduling").id)).toBe(false);
  });

  it("does not size acquisition at all", () => {
    // Nothing records the patients who did not arrive; sizing it from those who
    // did would measure the opposite of the thing.
    const { byConstraint } = deriveValues(
      [constraint("acquisition")],
      [m(MetricKey.PATIENTS_NEW_TODAY, 1)],
      NOW,
    );
    expect(byConstraint.size).toBe(0);
  });

  it("never converts appointments into money", () => {
    // Multiplying lost appointments by an average case value would be the
    // invented number in another form: the appointments that were lost are not a
    // random sample of the ones that were kept.
    const { byConstraint } = deriveValues(
      [constraint("scheduling")],
      [
        m(MetricKey.APPOINTMENTS_CANCELLED_TODAY, 3),
        m(MetricKey.APPOINTMENTS_NO_SHOWS_TODAY, 2),
        m(MetricKey.TREATMENT_AVERAGE_CASE_VALUE_30D, 4000),
      ],
      NOW,
    );
    expect(byConstraint.get(constraint("scheduling").id)?.[0].unit).toBe("count");
  });
});

describe("comparing what is at stake", () => {
  const money = (amount: number) => [
    { id: "v", type: "revenue_recovered" as const, amount, unit: "currency" as const, measuredAt: NOW },
  ];

  it("puts the larger figure first", () => {
    expect(compareValueAtStake(money(2000), money(80000))).toBeGreaterThan(0);
    expect(compareValueAtStake(money(80000), money(2000))).toBeLessThan(0);
  });

  it("declines to compare different units", () => {
    // Rupees and appointments do not convert, and pretending otherwise is the
    // same invented number wearing a different hat.
    const appointments = [
      { id: "v", type: "appointments_booked" as const, amount: 5, unit: "count" as const, measuredAt: NOW },
    ];
    expect(compareValueAtStake(money(80000), appointments)).toBe(0);
  });

  it("declines to compare when either side is unsized", () => {
    expect(compareValueAtStake(money(80000), undefined)).toBe(0);
    expect(compareValueAtStake(undefined, undefined)).toBe(0);
  });
});

// ── Interaction with strategy ranking ────────────────────────────────────────

function hypothesis(slug: string): Hypothesis {
  return {
    id: `dx#h.${slug}`,
    statement: `Statement for ${slug}.`,
    status: "supported",
    confidence: 0.6,
    supporting: [],
    contradicting: [],
    requiredData: [],
  };
}

function diagnosis(over: Partial<Diagnosis>): Diagnosis {
  return {
    id: "dx",
    pattern: "collection_gap",
    title: "A finding",
    summary: "Summary.",
    category: "financial",
    severity: "high",
    confidence: 0.6,
    persistence: "transient",
    signalIds: [],
    metricIds: [],
    hypotheses: [],
    discriminators: [],
    relatedEntities: [],
    evidence: [],
    generatedAt: NOW,
    ...over,
  };
}

describe("ranking strategies", () => {
  const diagnoses = [
    diagnosis({ id: "a", pattern: "collection_gap", severity: "high", hypotheses: [hypothesis("systemic_process")] }),
    diagnosis({
      id: "b",
      pattern: "pipeline_conversion_failure",
      severity: "high",
      hypotheses: [{ ...hypothesis("unconverted_demand"), id: "b#h.unconverted_demand" }],
    }),
  ];

  it("orders equal-urgency strategies by how much is at stake", () => {
    const { constraints } = deriveConstraints(diagnoses, CLINIC, DATE, NOW);
    const { byConstraint } = deriveValues(
      constraints,
      [
        m(MetricKey.REVENUE_OUTSTANDING, 2000),
        m(MetricKey.REVENUE_PENDING_TREATMENT_VALUE, 80000),
      ],
      NOW,
    );
    const { strategies } = proposeStrategies(
      constraints,
      diagnoses,
      CLINIC,
      DATE,
      NOW,
      byConstraint,
    );
    // Both constraints are `high`, so severity cannot separate them. The 80,000
    // one comes first.
    expect(strategies[0].constraintId).toContain("treatment_acceptance");
  });

  it("NEVER lets size overrule urgency", () => {
    // A large slow problem must not outrank a small urgent one — that would
    // quietly set an exchange rate between money and risk that nobody chose.
    const urgentButSmall = [
      diagnosis({ id: "a", pattern: "collection_gap", severity: "critical", hypotheses: [hypothesis("systemic_process")] }),
      diagnosis({
        id: "b",
        pattern: "pipeline_conversion_failure",
        severity: "low",
        hypotheses: [{ ...hypothesis("unconverted_demand"), id: "b#h.unconverted_demand" }],
      }),
    ];
    const { constraints } = deriveConstraints(urgentButSmall, CLINIC, DATE, NOW);
    const { byConstraint } = deriveValues(
      constraints,
      [
        m(MetricKey.REVENUE_OUTSTANDING, 2000),
        m(MetricKey.REVENUE_PENDING_TREATMENT_VALUE, 999999),
      ],
      NOW,
    );
    const { strategies } = proposeStrategies(constraints, urgentButSmall, CLINIC, DATE, NOW, byConstraint);
    expect(strategies[0].priority).toBe("critical");
    expect(strategies[0].constraintId).toContain("revenue_leakage");
  });

  it("still produces the same strategies without any value information", () => {
    // Value orders; it never decides what is proposed.
    const { constraints } = deriveConstraints(diagnoses, CLINIC, DATE, NOW);
    const withValue = proposeStrategies(constraints, diagnoses, CLINIC, DATE, NOW, new Map());
    const without = proposeStrategies(constraints, diagnoses, CLINIC, DATE, NOW);
    expect(withValue.strategies.map((s) => s.id).sort()).toEqual(
      without.strategies.map((s) => s.id).sort(),
    );
  });

  it("states the KIND of value acting would produce, never an amount", () => {
    const { constraints } = deriveConstraints(diagnoses, CLINIC, DATE, NOW);
    const { strategies } = proposeStrategies(constraints, diagnoses, CLINIC, DATE, NOW);
    const corrective = strategies.filter((s) => s.kind === StrategyKind.CORRECTIVE);
    expect(corrective.length).toBeGreaterThan(0);
    for (const s of corrective) {
      expect(s.expectedValueTypes?.length).toBeGreaterThan(0);
      // No figure anywhere in the recommendation itself.
      expect(`${s.title} ${s.description}`).not.toMatch(/\d{3,}/);
    }
  });
});
