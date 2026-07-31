/**
 * lib/business-brain/dashboard-view.ts
 *
 * Presentation projection of a `BusinessBrainResult`.
 *
 * This file contains NO business logic. It does not decide what is true, what
 * matters, or what to do — it only reshapes what the engines already decided
 * into the order and grouping the UI renders. Every judgement (severity,
 * confidence, persistence, which hypotheses hold) arrives already made.
 *
 * Two boundaries it deliberately does not cross:
 *
 * 1. It does not RANK. The Diagnosis Engine has no `priority` field on purpose —
 *    deciding what to do first is a later phase's job. Grouping by severity here
 *    is visual hierarchy over a value the engine itself emits, not a
 *    recommendation, and the UI never says "do this first".
 *
 * 2. It does not ADVISE. `no-advice.spec.ts` asserts the engine never emits
 *    advisory language; the dashboard must not add any either.
 */

import type {
  BusinessBrainResult,
  DecisionTrace,
  Diagnosis,
  Metric,
  Severity,
  Signal,
} from "@/business-brain";

/** Most to least severe. Used for grouping and for picking the headline. */
const SEVERITY_ORDER: readonly Severity[] = ["critical", "high", "medium", "low", "info"];

function severityRank(s: Severity): number {
  const i = SEVERITY_ORDER.indexOf(s);
  return i === -1 ? SEVERITY_ORDER.length : i;
}

/** Overall read of the day, derived only from the severities present. */
export type ClinicStatus = "critical" | "attention" | "watch" | "steady" | "unknown";

export interface StatusView {
  readonly status: ClinicStatus;
  readonly headline: string;
  /** One plain sentence describing what was found. Never a recommendation. */
  readonly detail: string;
  readonly signalCount: number;
  readonly diagnosisCount: number;
}

export interface MetricGroup {
  readonly category: string;
  readonly label: string;
  readonly metrics: readonly Metric[];
}

export interface UnmeasuredItem {
  /** Human-readable name of the check that could not run. */
  readonly label: string;
  /** The engine's own reason, with its "Skipped: " prefix removed. */
  readonly reason: string;
}

export interface DashboardView {
  readonly status: StatusView;
  /** Signals grouped by severity, most severe first. */
  readonly signalGroups: readonly { severity: Severity; signals: readonly Signal[] }[];
  /** Diagnoses ordered by severity for display. */
  readonly diagnoses: readonly Diagnosis[];
  readonly metricGroups: readonly MetricGroup[];
  /** Checks the engine could not perform, and why. */
  readonly unmeasured: readonly UnmeasuredItem[];
  readonly measuredCount: number;
}

/** Display names for metric categories, in the order a clinic reads them. */
const CATEGORY_LABELS: Record<string, string> = {
  revenue: "Revenue",
  utilization: "Capacity",
  scheduling: "Scheduling",
  clinical: "Treatment",
  retention: "Retention",
  acquisition: "New patients",
  operational: "Today in the clinic",
};

const CATEGORY_ORDER = [
  "revenue",
  "utilization",
  "scheduling",
  "clinical",
  "retention",
  "acquisition",
  "operational",
];

/**
 * Turn a signal type ("revenue.low_daily_revenue") into a readable check name.
 * Presentation only — the engine's identifiers stay untouched.
 */
export function humaniseStep(step: string): string {
  const name = step.includes(".") ? step.slice(step.indexOf(".") + 1) : step;
  const words = name.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The overall read.
 *
 * Deliberately NOT a numeric health score. A composite over inputs that have
 * not been individually validated produces a number nobody can explain, and the
 * first time it disagrees with what the dentist sees the whole dashboard loses
 * credibility. This is a direct restatement of the worst severity present, which
 * is always traceable to a specific signal.
 */
function buildStatus(signals: readonly Signal[], diagnoses: readonly Diagnosis[]): StatusView {
  const counts = { signalCount: signals.length, diagnosisCount: diagnoses.length };

  if (signals.length === 0) {
    return {
      status: "steady",
      headline: "Nothing needs attention",
      detail:
        "Every check ran and none crossed its threshold. This reflects today's data only.",
      ...counts,
    };
  }

  const worst = signals.reduce<Severity>(
    (acc, s) => (severityRank(s.severity) < severityRank(acc) ? s.severity : acc),
    "info",
  );

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const detail =
    diagnoses.length > 0
      ? `${plural(signals.length, "observation", "observations")}, correlated into ${plural(
          diagnoses.length,
          "pattern",
          "patterns",
        )}.`
      : `${plural(signals.length, "observation", "observations")}. No pattern correlates them yet.`;

  if (worst === "critical") {
    return { status: "critical", headline: "Critical observations", detail, ...counts };
  }
  if (worst === "high") {
    return { status: "attention", headline: "Needs attention", detail, ...counts };
  }
  if (worst === "medium") {
    return { status: "watch", headline: "Worth watching", detail, ...counts };
  }
  return { status: "watch", headline: "Minor observations", detail, ...counts };
}

/**
 * Checks that could not run, read back from the Signal Engine's own trace.
 *
 * This is the most trust-building thing on the dashboard and the reason the
 * trace is carried through the pipeline at all: a check that measured nothing
 * and a check that could not run lead to different conclusions, and a dashboard
 * that hides the second is quietly overstating what it knows.
 */
function buildUnmeasured(trace: readonly DecisionTrace[]): UnmeasuredItem[] {
  return trace
    .filter((t) => t.reasoning.startsWith("Skipped:"))
    .map((t) => ({
      label: humaniseStep(t.step),
      reason: t.reasoning.replace(/^Skipped:\s*/, "").replace(/\.$/, ""),
    }));
}

function buildMetricGroups(metrics: readonly Metric[]): MetricGroup[] {
  const byCategory = new Map<string, Metric[]>();
  for (const m of metrics) {
    const list = byCategory.get(m.category) ?? [];
    list.push(m);
    byCategory.set(m.category, list);
  }
  return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => ({
    category,
    label: CATEGORY_LABELS[category] ?? category,
    metrics: (byCategory.get(category) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

/** Project one pipeline run into everything the dashboard renders. */
export function buildDashboardView(result: BusinessBrainResult): DashboardView {
  const signalGroups = SEVERITY_ORDER.map((severity) => ({
    severity,
    signals: result.signals.filter((s) => s.severity === severity),
  })).filter((g) => g.signals.length > 0);

  const diagnoses = result.diagnoses
    .slice()
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  return {
    status: buildStatus(result.signals, result.diagnoses),
    signalGroups,
    diagnoses,
    metricGroups: buildMetricGroups(result.metrics),
    unmeasured: buildUnmeasured(result.trace),
    measuredCount: result.metrics.length,
  };
}

// ── Formatting ───────────────────────────────────────────────────────────────

/**
 * Confidence is DATA COMPLETENESS, never a probability that a conclusion is
 * correct. The wording matters: "high confidence" next to a diagnosis would be
 * read as "probably true", which is not what the engine measured.
 */
export function confidenceLabel(confidence: number | undefined): string {
  if (confidence === undefined) return "Not reported";
  if (confidence >= 0.85) return "Fully measured";
  if (confidence >= 0.6) return "Mostly measured";
  if (confidence >= 0.4) return "Partly measured";
  return "Thinly measured";
}

const PERSISTENCE_LABELS: Record<string, string> = {
  insufficient_history: "Not enough history",
  transient: "One-off so far",
  intermittent: "On and off",
  sustained: "Ongoing",
  worsening: "Worsening",
  improving: "Improving",
};

export function persistenceLabel(persistence: string): string {
  return PERSISTENCE_LABELS[persistence] ?? persistence;
}

const AVAILABILITY_LABELS: Record<string, string> = {
  available: "Can be checked now",
  requires_longer_history: "Needs more history",
  requires_entity_data: "Needs record-level data",
  requires_new_metric: "Needs a new measurement",
  requires_data_capture: "Needs something the clinic does not record yet",
};

export function availabilityLabel(availability: string): string {
  return AVAILABILITY_LABELS[availability] ?? availability;
}
