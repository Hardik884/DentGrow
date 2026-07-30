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
  confidenceLabel,
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
    expect(view.status.headline).toBe("Nothing needs attention");
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

  it("says so when observations correlate into no pattern", () => {
    const view = buildDashboardView(result({ signals: [signal()] }));
    expect(view.status.detail).toContain("No pattern correlates them yet");
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
    expect(view.unmeasured[0].label).toBe("Accepted treatments unscheduled");
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
