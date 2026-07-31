/**
 * Specs for the Constraint and Strategy engines.
 *
 * Strategy is the first component in the pipeline allowed to say what to do, so
 * the tests are mostly about the limits of that licence rather than about the
 * wording of any particular recommendation:
 *
 *   - it may act only on a cause the Diagnosis Engine SETTLED. Advising a fix
 *     for an undetermined cause is guessing in the same voice as analysis, which
 *     is worse than saying nothing.
 *   - an unrecognised cause produces silence, not something generic that happens
 *     to fit the category.
 *   - constraints, which sit upstream, are still held to the no-advice rule.
 */

import { describe, expect, it } from "vitest";

import type { Constraint, Diagnosis, Hypothesis } from "../../domain";
import { deriveConstraints } from "../constraint";
import { proposeStrategies, StrategyKind } from "../strategy";

const CLINIC = "c1";
const DATE = "2026-08-01";
const NOW = "2026-08-01T06:30:00.000Z";

function hypothesis(slug: string, status: Hypothesis["status"]): Hypothesis {
  return {
    id: `dx#h.${slug}`,
    statement: `Statement for ${slug}.`,
    status,
    confidence: 0.6,
    supporting: [],
    contradicting: [],
    requiredData: status === "undetermined" ? ["a measurement"] : [],
  };
}

function diagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    id: "dx",
    pattern: "schedule_attrition",
    title: "Appointments booked and then lost",
    summary: "Cancellations and no-shows above their thresholds.",
    category: "scheduling",
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

function strategiesFor(diagnoses: readonly Diagnosis[]) {
  const { constraints } = deriveConstraints(diagnoses, CLINIC, DATE, NOW);
  return { constraints, ...proposeStrategies(constraints, diagnoses, CLINIC, DATE, NOW) };
}

describe("constraints", () => {
  it("collapses several diagnoses about one resource into one bottleneck", () => {
    // demand_supply_mismatch and capacity_ceiling are opposite readings of the
    // same resource. Two headlines that contradict each other is worse guidance
    // than one that names the resource.
    const { constraints } = deriveConstraints(
      [
        diagnosis({ id: "a", pattern: "demand_supply_mismatch" }),
        diagnosis({ id: "b", pattern: "capacity_ceiling" }),
      ],
      CLINIC,
      DATE,
      NOW,
    );
    expect(constraints).toHaveLength(1);
    expect(constraints[0].category).toBe("capacity");
    expect(constraints[0].relatedDiagnosisIds).toEqual(["a", "b"]);
  });

  it("takes the WORST severity, never an average", () => {
    // Averaging would let two mild findings dilute a critical one into something
    // that reads as routine.
    const { constraints } = deriveConstraints(
      [
        diagnosis({ id: "a", pattern: "collection_gap", severity: "low" }),
        diagnosis({ id: "b", pattern: "revenue_shortfall", severity: "critical" }),
      ],
      CLINIC,
      DATE,
      NOW,
    );
    expect(constraints[0].severity).toBe("critical");
  });

  it("ranks one critical finding above three low ones", () => {
    // Count measures how many lenses caught a problem — a property of the
    // catalogue, not of the clinic.
    const { constraints } = deriveConstraints(
      [
        diagnosis({ id: "a", pattern: "demand_supply_mismatch", severity: "low" }),
        diagnosis({ id: "b", pattern: "capacity_ceiling", severity: "low" }),
        diagnosis({ id: "c", pattern: "throughput_congestion", severity: "low" }),
        diagnosis({ id: "d", pattern: "collection_gap", severity: "critical" }),
      ],
      CLINIC,
      DATE,
      NOW,
    );
    expect(constraints[0].category).toBe("revenue_leakage");
  });

  it("does not promote an unclustered signal to a bottleneck", () => {
    // It exists to report a signal that matched no pattern. Calling that a
    // business problem would dress up one odd number as a finding.
    const { constraints } = deriveConstraints(
      [diagnosis({ pattern: "unclustered_signal" })],
      CLINIC,
      DATE,
      NOW,
    );
    expect(constraints).toEqual([]);
  });

  it("is insensitive to the order diagnoses arrive in", () => {
    const input = [
      diagnosis({ id: "a", pattern: "collection_gap", severity: "medium" }),
      diagnosis({ id: "b", pattern: "schedule_attrition", severity: "high" }),
      diagnosis({ id: "c", pattern: "patient_base_erosion", severity: "low" }),
    ];
    const forward = deriveConstraints(input, CLINIC, DATE, NOW);
    const reverse = deriveConstraints([...input].reverse(), CLINIC, DATE, NOW);
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reverse));
  });

  it("never advises — that licence belongs to Strategy alone", () => {
    const advisory = /\b(should|consider|recommend|try|need to|must|ought to|suggest|advis)/i;
    const { constraints } = deriveConstraints(
      [
        diagnosis({ id: "a", pattern: "schedule_attrition" }),
        diagnosis({ id: "b", pattern: "collection_gap" }),
        diagnosis({ id: "c", pattern: "recall_process_failure" }),
      ],
      CLINIC,
      DATE,
      NOW,
    );
    expect(constraints.length).toBeGreaterThan(0);
    for (const c of constraints) {
      expect(advisory.test(c.name)).toBe(false);
      expect(advisory.test(c.description)).toBe(false);
    }
  });
});

describe("acting only on what was settled", () => {
  it("proposes a corrective strategy for a SUPPORTED cause", () => {
    const { strategies } = strategiesFor([
      diagnosis({ hypotheses: [hypothesis("no_show_dominant", "supported")] }),
    ]);
    const corrective = strategies.filter((s) => s.kind === StrategyKind.CORRECTIVE);
    expect(corrective).toHaveLength(1);
    expect(corrective[0].basedOn).toEqual(["dx#h.no_show_dominant"]);
  });

  it("REFUSES to act on an undetermined cause", () => {
    // The centre of the whole design. An undetermined hypothesis means the
    // engine could not tell which explanation fits; recommending a fix anyway is
    // guessing, delivered in the same voice as the findings that were real.
    const { strategies } = strategiesFor([
      diagnosis({ hypotheses: [hypothesis("no_show_dominant", "undetermined")] }),
    ]);
    expect(strategies.every((s) => s.kind === StrategyKind.INVESTIGATIVE)).toBe(true);
    expect(strategies.every((s) => s.basedOn.length === 0)).toBe(true);
  });

  it("REFUSES to act on a contradicted cause", () => {
    const { strategies } = strategiesFor([
      diagnosis({ hypotheses: [hypothesis("no_show_dominant", "contradicted")] }),
    ]);
    expect(strategies.some((s) => s.kind === StrategyKind.CORRECTIVE)).toBe(false);
  });

  it("says nothing rather than something generic for an unrecognised cause", () => {
    // Silence is the safe direction: advice that merely fits the category is
    // advice about nothing in particular.
    const { strategies } = strategiesFor([
      diagnosis({ hypotheses: [hypothesis("some_cause_with_no_template", "supported")] }),
    ]);
    expect(strategies.some((s) => s.kind === StrategyKind.CORRECTIVE)).toBe(false);
  });

  it("names each recommendation's cause, so it can be judged rather than trusted", () => {
    const { strategies } = strategiesFor([
      diagnosis({ hypotheses: [hypothesis("uncollected", "supported")] }),
    ]);
    expect(strategies[0].rationale).toBe("Statement for uncollected.");
    expect(strategies[0].diagnosisIds).toEqual(["dx"]);
  });

  it("tells a clinic about one cause once, however many diagnoses found it", () => {
    const { strategies } = strategiesFor([
      diagnosis({ id: "a", pattern: "collection_gap", hypotheses: [hypothesis("uncollected", "supported")] }),
      diagnosis({ id: "b", pattern: "revenue_shortfall", hypotheses: [hypothesis("uncollected", "supported")] }),
    ]);
    const corrective = strategies.filter((s) => s.kind === StrategyKind.CORRECTIVE);
    expect(corrective).toHaveLength(1);
    expect(corrective[0].diagnosisIds).toEqual(["a", "b"]);
  });
});

describe("investigative strategies", () => {
  it("names the measurement that would settle it, rather than saying to look into it", () => {
    const { strategies } = strategiesFor([
      diagnosis({
        hypotheses: [hypothesis("no_show_dominant", "undetermined")],
        discriminators: [
          {
            id: "dx#d.reminder_delivery_log",
            description: "Whether a reminder was dispatched for each affected appointment.",
            wouldSeparate: ["dx#h.no_show_dominant"],
            availability: "requires_data_capture",
          },
        ],
      }),
    ]);
    expect(strategies[0].description).toContain("Whether a reminder was dispatched");
  });

  it("is withheld once a cause is established", () => {
    // A clinic with an answer must not simultaneously be told to go find one.
    const { strategies } = strategiesFor([
      diagnosis({ hypotheses: [hypothesis("no_show_dominant", "supported")] }),
    ]);
    expect(strategies.some((s) => s.kind === StrategyKind.INVESTIGATIVE)).toBe(false);
  });

  it("ranks below acting, even on a critical constraint", () => {
    // Knowing that something is unexplained is less urgent than acting on
    // something understood, however severe the symptom looks.
    const { strategies } = strategiesFor([
      diagnosis({ severity: "critical", hypotheses: [hypothesis("x", "undetermined")] }),
    ]);
    expect(strategies[0].priority).toBe("high");
  });

  it("still proposes a direction when no discriminator was attached", () => {
    const { strategies } = strategiesFor([
      diagnosis({ hypotheses: [hypothesis("x", "undetermined")], discriminators: [] }),
    ]);
    expect(strategies).toHaveLength(1);
    expect(strategies[0].description).toContain("has not been identified");
  });
});

describe("ordering", () => {
  it("puts what can be acted on above what must be investigated", () => {
    const { strategies } = strategiesFor([
      diagnosis({
        id: "a",
        pattern: "schedule_attrition",
        severity: "high",
        hypotheses: [hypothesis("no_show_dominant", "supported")],
      }),
      diagnosis({
        id: "b",
        pattern: "collection_gap",
        severity: "high",
        hypotheses: [hypothesis("x", "undetermined")],
      }),
    ]);
    expect(strategies[0].kind).toBe(StrategyKind.CORRECTIVE);
  });

  it("puts a critical constraint above a high one", () => {
    const { strategies } = strategiesFor([
      diagnosis({
        id: "a",
        pattern: "schedule_attrition",
        severity: "medium",
        hypotheses: [hypothesis("no_show_dominant", "supported")],
      }),
      diagnosis({
        id: "b",
        pattern: "collection_gap",
        severity: "critical",
        hypotheses: [hypothesis("uncollected", "supported")],
      }),
    ]);
    expect(strategies[0].priority).toBe("critical");
  });

  it("produces byte-identical output across repeated runs", () => {
    const input = [
      diagnosis({ id: "a", pattern: "schedule_attrition", hypotheses: [hypothesis("no_show_dominant", "supported")] }),
      diagnosis({ id: "b", pattern: "collection_gap", hypotheses: [hypothesis("uncollected", "supported")] }),
    ];
    expect(JSON.stringify(strategiesFor(input))).toBe(JSON.stringify(strategiesFor(input)));
  });

  it("is insensitive to the order diagnoses arrive in", () => {
    const input = [
      diagnosis({ id: "a", pattern: "schedule_attrition", hypotheses: [hypothesis("no_show_dominant", "supported")] }),
      diagnosis({ id: "b", pattern: "collection_gap", hypotheses: [hypothesis("uncollected", "supported")] }),
    ];
    expect(strategiesFor(input).strategies.map((s) => s.id)).toEqual(
      strategiesFor([...input].reverse()).strategies.map((s) => s.id),
    );
  });
});

describe("quiet days", () => {
  it("proposes nothing when there are no diagnoses", () => {
    expect(strategiesFor([]).strategies).toEqual([]);
  });

  it("proposes nothing for a constraint set that is empty", () => {
    expect(proposeStrategies([] as readonly Constraint[], [], CLINIC, DATE, NOW).strategies)
      .toEqual([]);
  });
});
