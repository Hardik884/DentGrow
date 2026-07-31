/**
 * Specs for the Business Brain dashboard's gate and presentation projection.
 *
 * Both are pure, so these run without a database. The gate matters most: it is
 * the only thing standing between a development surface and the live pilot
 * clinic, and a regression there is invisible until a dentist sees a page they
 * should never have been shown.
 */

import { describe, expect, it } from "vitest";

import type { BusinessBrainResult, Diagnosis, Metric, Signal } from "@/business-brain";
import { BUSINESS_BRAIN_CLINIC_IDS, isBusinessBrainEnabled } from "@/lib/feature-flags";
import {
  buildDashboardView,
  buildFocusCards,
  confidenceLabel,
  headlineMetrics,
  humaniseStep,
} from "@/lib/business-brain/dashboard-view";

const DEMO_CLINIC = "00000000-0000-0000-0000-000000000001";
const PILOT_CLINIC = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "22222222-2222-2222-2222-222222222222";

describe("feature gate", () => {
  it("allows the development clinic", () => {
    expect(isBusinessBrainEnabled(DEMO_CLINIC)).toBe(true);
  });

  it("REFUSES the live pilot clinic", () => {
    expect(isBusinessBrainEnabled(PILOT_CLINIC)).toBe(false);
  });

  it("refuses every other clinic, including unknown ids", () => {
    expect(isBusinessBrainEnabled(CLINIC_B)).toBe(false);
    expect(isBusinessBrainEnabled("99999999-9999-9999-9999-999999999999")).toBe(false);
  });

  it("refuses a missing clinic rather than defaulting open", () => {
    expect(isBusinessBrainEnabled(null)).toBe(false);
    expect(isBusinessBrainEnabled(undefined)).toBe(false);
    expect(isBusinessBrainEnabled("")).toBe(false);
  });

  it("keeps the allow-list to development clinics only", () => {
    // Guards the most damaging possible edit to this file.
    expect(BUSINESS_BRAIN_CLINIC_IDS).toEqual([DEMO_CLINIC]);
    expect(BUSINESS_BRAIN_CLINIC_IDS).not.toContain(PILOT_CLINIC);
  });
});

// ── Projection fixtures ──────────────────────────────────────────────────────

function metric(over: Partial<Metric> = {}): Metric {
  return {
    id: "revenue.outstanding:c:2026-07-28",
    name: "Outstanding Payments",
    value: 1000,
    unit: "currency",
    category: "revenue",
    timestamp: "2026-07-28T06:30:00.000Z",
    ...over,
  };
}

function signal(over: Partial<Signal> = {}): Signal {
  return {
    id: "signal.revenue.high_outstanding:c:2026-07-28",
    title: "Outstanding balance is high",
    description: "Outstanding is INR 30,000 against a limit of INR 25,000.",
    severity: "medium",
    priority: "medium",
    relatedEntities: [],
    generatedAt: "2026-07-28T06:30:00.000Z",
    ...over,
  };
}

function diagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    id: "diagnosis.collection_gap:c:2026-07-28",
    pattern: "collection_gap",
    title: "Work delivered is not converting to cash",
    summary: "Completed treatments today with no matching collection.",
    category: "financial",
    severity: "medium",
    confidence: 0.7,
    persistence: "transient",
    signalIds: [],
    metricIds: [],
    hypotheses: [],
    discriminators: [],
    relatedEntities: [],
    evidence: [],
    generatedAt: "2026-07-28T06:30:00.000Z",
    ...over,
  };
}

function result(over: Partial<BusinessBrainResult> = {}): BusinessBrainResult {
  return {
    clinicId: "c",
    date: "2026-07-28",
    ok: true,
    metrics: [],
    signals: [],
    diagnoses: [],
    trace: [],
    recomputedHistory: [],
    constraints: [],
    strategies: [],
    valueAtStake: new Map(),
    execution: {
      clinicId: "c",
      date: "2026-07-28",
      correlationId: "corr",
      startedAt: "2026-07-28T06:30:00.000Z",
      completedAt: "2026-07-28T06:30:01.000Z",
      durationMs: 1000,
      version: "0.5.0",
      historyDaysRequested: 7,
      historyDaysLoaded: 7,
      calibration: [],
      stages: [],
    },
    ...over,
  };
}

describe("status", () => {
  it("reports steady when nothing fired", () => {
    const view = buildDashboardView(result());
    expect(view.status.status).toBe("steady");
    expect(view.status.headline).toBe("Nothing needs attention today");
  });

  it("escalates to the WORST severity present, not the most common", () => {
    const view = buildDashboardView(
      result({
        signals: [
          signal({ id: "a", severity: "low" }),
          signal({ id: "b", severity: "low" }),
          signal({ id: "c", severity: "critical" }),
        ],
      }),
    );
    expect(view.status.status).toBe("critical");
  });

  it("distinguishes high from medium", () => {
    expect(buildDashboardView(result({ signals: [signal({ severity: "high" })] })).status.status)
      .toBe("attention");
    expect(buildDashboardView(result({ signals: [signal({ severity: "medium" })] })).status.status)
      .toBe("watch");
  });

  it("counts PROBLEMS, not pipeline stages", () => {
    // One problem routinely produces several signals and several diagnoses, so
    // counting those told a dentist about our architecture and left them to work
    // out it was one thing.
    const view = buildDashboardView(
      result({
        signals: [signal({ id: "a" }), signal({ id: "b" }), signal({ id: "c" })],
        constraints: [
          {
            id: "constraint.revenue_leakage:c:2026-07-28",
            name: "Work delivered against money received",
            description: "Two findings point here.",
            category: "revenue_leakage",
            severity: "high",
            relatedDiagnosisIds: ["d1"],
            identifiedAt: "2026-07-28T06:30:00.000Z",
          },
        ],
      }),
    );
    expect(view.status.headline).toBe("1 thing needs your attention");
    expect(view.status.detail).toContain("1 area to look at");
  });

  it("says plainly when figures are unusual but tie to no cause", () => {
    // Real, and the page cannot say what they add up to. Claiming a problem
    // count here would imply an understanding the engine does not have.
    const view = buildDashboardView(result({ signals: [signal()] }));
    expect(view.status.headline).toBe("Something looks unusual");
    expect(view.status.detail).toContain("not yet tied to a single cause");
  });

  it("never contains advisory language", () => {
    // The engine is held to this by no-advice.spec.ts; the dashboard must not
    // reintroduce it in the copy it adds around the engine's output.
    const advisory = /\b(should|consider|recommend|try|need to|must|ought to|suggest|advis)/i;
    for (const signals of [[], [signal({ severity: "critical" })], [signal({ severity: "low" })]]) {
      const s = buildDashboardView(result({ signals })).status;
      expect(advisory.test(s.headline)).toBe(false);
      expect(advisory.test(s.detail)).toBe(false);
    }
  });
});

describe("grouping", () => {
  it("groups signals by severity, most severe first, dropping empty groups", () => {
    const view = buildDashboardView(
      result({
        signals: [
          signal({ id: "a", severity: "low" }),
          signal({ id: "b", severity: "critical" }),
          signal({ id: "c", severity: "low" }),
        ],
      }),
    );
    expect(view.signalGroups.map((g) => g.severity)).toEqual(["critical", "low"]);
    expect(view.signalGroups[1].signals).toHaveLength(2);
  });

  it("orders diagnoses by severity", () => {
    const view = buildDashboardView(
      result({
        diagnoses: [
          diagnosis({ id: "d1", severity: "low" }),
          diagnosis({ id: "d2", severity: "critical" }),
        ],
      }),
    );
    expect(view.diagnoses.map((d) => d.id)).toEqual(["d2", "d1"]);
  });

  it("groups metrics by category in reading order", () => {
    const view = buildDashboardView(
      result({
        metrics: [
          metric({ id: "m1", category: "operational" }),
          metric({ id: "m2", category: "revenue" }),
        ],
      }),
    );
    expect(view.metricGroups.map((g) => g.category)).toEqual(["revenue", "operational"]);
    expect(view.metricGroups[0].label).toBe("Revenue");
  });
});

describe("unmeasured checks", () => {
  it("surfaces skipped evaluators with their reason, and nothing else", () => {
    const view = buildDashboardView(
      result({
        trace: [
          {
            engine: "SignalEngine",
            step: "clinical.accepted_treatments_unscheduled",
            reasoning: "Skipped: missing metric treatment.accepted_pending_scheduling.",
            evidence: [],
            timestamp: "2026-07-28T06:30:00.000Z",
          },
          {
            engine: "SignalEngine",
            step: "revenue.high_outstanding",
            reasoning: "No signal: outstanding is within its limit.",
            evidence: [],
            timestamp: "2026-07-28T06:30:00.000Z",
          },
        ],
      }),
    );

    expect(view.unmeasured).toHaveLength(1);
    expect(view.unmeasured[0].label).toBe("Planned treatment with no next visit booked");
    expect(view.unmeasured[0].reason).toBe(
      "missing metric treatment.accepted_pending_scheduling",
    );
  });
});

describe("wording", () => {
  it("describes confidence as coverage, never as likelihood", () => {
    // Confidence is data completeness. Labelling it "likely" or "probable"
    // would claim something the engine never measured.
    const labels = [1, 0.7, 0.5, 0.2].map(confidenceLabel).join(" ");
    expect(labels).toMatch(/measured/);
    expect(labels).not.toMatch(/likely|probable|certain|accurate/i);
    expect(confidenceLabel(undefined)).toBe("Not reported");
  });

  it("turns an engine identifier into a readable check name", () => {
    expect(humaniseStep("scheduling.high_no_show_rate")).toBe("High no show rate");
    expect(humaniseStep("index-metrics")).toBe("Index-metrics");
  });
});

/**
 * Focus cards are what a dentist actually reads, so the projection carries the
 * same honesty rules as the engines: an unmeasured figure must not render as
 * zero, and nothing may be shown that the run did not produce.
 */
describe("focus cards", () => {
  const CONSTRAINT_ID = "constraint.revenue_leakage:c:2026-07-28";

  function constraint(over: Record<string, unknown> = {}) {
    return {
      id: CONSTRAINT_ID,
      name: "Work delivered against money received",
      description: "One finding points here.",
      category: "revenue_leakage" as const,
      severity: "high" as const,
      relatedDiagnosisIds: ["d1"],
      identifiedAt: "2026-07-28T06:30:00.000Z",
      ...over,
    };
  }

  function strategy(over: Record<string, unknown> = {}) {
    return {
      id: "strategy.revenue_leakage.systemic_process:c:2026-07-28",
      title: "Collect at checkout, every time",
      description: "Treatments were completed and the money has not arrived.",
      constraintId: CONSTRAINT_ID,
      priority: "high" as const,
      kind: "corrective" as const,
      basedOn: ["d1#h.systemic_process"],
      diagnosisIds: ["d1"],
      rationale: "Statement.",
      createdAt: "2026-07-28T06:30:00.000Z",
      ...over,
    };
  }

  it("names the problem in words a clinic uses, not the engine's category", () => {
    const cards = buildFocusCards(result({ constraints: [constraint()] }));
    expect(cards[0].title).toBe("Money owed for work already done");
  });

  it("shows how much is at stake, formatted the way it would be said aloud", () => {
    const cards = buildFocusCards(
      result({
        constraints: [constraint()],
        valueAtStake: new Map([
          [
            CONSTRAINT_ID,
            [{ id: "v", type: "revenue_recovered" as const, amount: 42000, unit: "currency" as const, measuredAt: "x" }],
          ],
        ]),
      }),
    );
    expect(cards[0].atStake).toBe("₹42,000");
    expect(cards[0].atStakeLabel).toBe("still unpaid");
  });

  it("renders chair time as hours and minutes rather than a raw number", () => {
    const cards = buildFocusCards(
      result({
        constraints: [constraint({ id: "cap", category: "capacity" })],
        valueAtStake: new Map([
          ["cap", [{ id: "v", type: "hours_saved" as const, amount: 360, unit: "minutes" as const, measuredAt: "x" }]],
        ]),
      }),
    );
    expect(cards[0].atStake).toBe("6 hr");
  });

  it("shows NOTHING rather than zero when the size could not be measured", () => {
    // A dentist reading "₹0" would take it as "nothing owed", which is a
    // different claim from "we could not measure this".
    const cards = buildFocusCards(result({ constraints: [constraint()] }));
    expect(cards[0].atStake).toBeNull();
    expect(cards[0].atStakeLabel).toBeNull();
  });

  it("labels a settled cause as something to do and an unsettled one as something to find out", () => {
    const cards = buildFocusCards(
      result({
        constraints: [constraint()],
        strategies: [
          strategy(),
          strategy({ id: "s2", kind: "investigative" as const, basedOn: [], title: "Establish why" }),
        ],
      }),
    );
    expect(cards[0].actions.map((a) => a.kind)).toEqual(["act", "find_out"]);
  });

  it("attaches only the findings behind that problem", () => {
    const cards = buildFocusCards(
      result({
        constraints: [constraint()],
        diagnoses: [diagnosis({ id: "d1" }), diagnosis({ id: "d2" })],
      }),
    );
    expect(cards[0].diagnoses.map((d) => d.id)).toEqual(["d1"]);
  });

  it("keeps the engine's ordering rather than re-ranking", () => {
    // Constraints already carry severity ordering; a second opinion here could
    // disagree with the reasoning that produced them.
    const cards = buildFocusCards(
      result({
        constraints: [
          constraint({ id: "a", category: "revenue_leakage" }),
          constraint({ id: "b", category: "capacity", severity: "low" }),
        ],
      }),
    );
    expect(cards.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("produces no cards on a quiet day", () => {
    expect(buildFocusCards(result())).toEqual([]);
  });
});

describe("headline metrics", () => {
  it("shows a short fixed set rather than everything measured", () => {
    const metrics = [
      metric({ id: "revenue.outstanding:c:d", category: "revenue" }),
      metric({ id: "appointments.total_today:c:d", category: "operational" }),
      metric({ id: "followups.overdue:c:d", category: "retention" }),
    ];
    const headline = headlineMetrics(metrics);
    expect(headline.map((m) => m.id)).toEqual([
      "appointments.total_today:c:d",
      "revenue.outstanding:c:d",
    ]);
  });

  it("omits a headline figure that was not measured, rather than showing a gap", () => {
    expect(headlineMetrics([])).toEqual([]);
  });
});
