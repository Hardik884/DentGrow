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
/**
 * The one line at the top, answering the only question a dentist opens this page
 * with: is there anything I need to deal with?
 *
 * Counted in PROBLEMS, not in signals or diagnoses. Those are pipeline stages:
 * one problem routinely produces three signals and two diagnoses, so
 * "3 observations, correlated into 2 patterns" told a reader about our
 * architecture and left them to work out that it was one thing. A constraint is
 * already the deduplicated problem, so it is the honest thing to count.
 */
function buildStatus(
  signals: readonly Signal[],
  diagnoses: readonly Diagnosis[],
  problemCount: number,
): StatusView {
  const counts = { signalCount: signals.length, diagnosisCount: diagnoses.length };

  if (signals.length === 0) {
    return {
      status: "steady",
      headline: "Nothing needs attention today",
      detail: "Every check ran and none crossed its limit. This covers today only.",
      ...counts,
    };
  }

  const worst = signals.reduce<Severity>(
    (acc, s) => (severityRank(s.severity) < severityRank(acc) ? s.severity : acc),
    "info",
  );

  // A signal that grouped into no constraint is real but unexplained, so it is
  // reported as something to look at rather than counted as a problem the page
  // can describe.
  const detail =
    problemCount === 0
      ? `${signals.length} ${signals.length === 1 ? "figure" : "figures"} outside their usual range, not yet tied to a single cause.`
      : `${problemCount} ${problemCount === 1 ? "area" : "areas"} to look at, worst first.`;

  const headline =
    problemCount === 0
      ? "Something looks unusual"
      : `${problemCount} ${problemCount === 1 ? "thing needs" : "things need"} your attention`;

  if (worst === "critical") return { status: "critical", headline, detail, ...counts };
  if (worst === "high") return { status: "attention", headline, detail, ...counts };
  return { status: "watch", headline, detail, ...counts };
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
    status: buildStatus(result.signals, result.diagnoses, result.constraints.length),
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

// ─────────────────────────────────────────────────────────────────────────────
// Focus cards
//
// The dashboard's organising unit, and a deliberate departure from the pipeline
// that produces it.
//
// The engines think in stages: a signal crosses a threshold, diagnoses correlate
// signals, constraints group diagnoses, strategies address constraints. Showing
// those stages as sections meant a dentist read the same problem three times in
// three vocabularies — "Outstanding balance is high", then "Work delivered is
// not converting to cash", then a recommendation about collection. Each section
// was individually correct and the page as a whole was repetitive, so the reader
// had to work out which items were the same problem before they could count how
// many problems they had.
//
// A dentist's questions, in the order they ask them, are: is anything wrong,
// what is the biggest one, how much is it costing me, what do I do, and only
// then why do you say that. A focus card answers all five in that order, one
// card per real problem.
// ─────────────────────────────────────────────────────────────────────────────

/** What a dentist should do about one problem. */
export interface FocusAction {
  /** "Do this" for a settled cause; "Find out" when the cause is not settled. */
  readonly kind: "act" | "find_out";
  readonly title: string;
  readonly description: string;
}

/** One problem, sized, with what to do about it and why. */
export interface FocusCard {
  readonly id: string;
  /** Plain-language name of the problem. */
  readonly title: string;
  readonly severity: Severity;
  /**
   * How much is sitting in this problem, already formatted — "₹42,000",
   * "6 hr 0 min", "5 appointments". Absent when it could not be measured, which
   * is different from being zero and must not render as "0".
   */
  readonly atStake: string | null;
  /** Short label for what the figure counts, e.g. "unpaid". */
  readonly atStakeLabel: string | null;
  /** What to do. Empty only if the engine proposed nothing at all. */
  readonly actions: readonly FocusAction[];
  /** The findings behind it, shown on request rather than by default. */
  readonly diagnoses: readonly Diagnosis[];
}

/** Plain-language names, keyed by constraint category. */
const FOCUS_TITLES: Record<string, string> = {
  revenue_leakage: "Money owed for work already done",
  treatment_acceptance: "Treatment agreed but not booked in",
  capacity: "Chair time going unused",
  scheduling: "Appointments booked and then lost",
  retention: "Patients who have stopped coming back",
  acquisition: "New patients coming in",
};

/** What the figure on the card counts, in the fewest words that stay accurate. */
const AT_STAKE_LABELS: Record<string, string> = {
  revenue_leakage: "still unpaid",
  treatment_acceptance: "agreed, not booked",
  capacity: "empty chair time today",
  scheduling: "lost today",
  retention: "patients",
};

/** Format an at-stake amount the way a clinic would say it aloud. */
function formatAtStake(amount: number, unit: string): string {
  if (unit === "currency") {
    return `₹${Math.round(amount).toLocaleString("en-IN")}`;
  }
  if (unit === "minutes") {
    const hours = Math.floor(amount / 60);
    const minutes = Math.round(amount % 60);
    if (hours === 0) return `${minutes} min`;
    return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
  }
  return `${amount}`;
}

/**
 * Build one card per problem, worst first.
 *
 * Constraints already carry the grouping and the ordering, so this is a
 * presentation projection and not a second opinion: it renames, formats and
 * attaches, and decides nothing the engines have not already decided.
 */
export function buildFocusCards(result: BusinessBrainResult): readonly FocusCard[] {
  const diagnosisById = new Map(result.diagnoses.map((d) => [d.id, d]));

  return result.constraints.map((constraint): FocusCard => {
    const values = result.valueAtStake.get(constraint.id);
    const value = values?.[0];

    const actions = result.strategies
      .filter((s) => s.constraintId === constraint.id)
      .map((s): FocusAction => ({
        kind: s.kind === "corrective" ? "act" : "find_out",
        title: s.title,
        description: s.description,
      }));

    return {
      id: constraint.id,
      title: FOCUS_TITLES[constraint.category] ?? constraint.name,
      severity: constraint.severity,
      // Null rather than zero when unmeasured: "we did not measure this" and
      // "this is nothing" are different answers, and a dentist reading a zero
      // would take the second.
      atStake: value === undefined ? null : formatAtStake(value.amount, value.unit),
      atStakeLabel: value === undefined ? null : (AT_STAKE_LABELS[constraint.category] ?? null),
      actions,
      diagnoses: (constraint.relatedDiagnosisIds ?? [])
        .map((id) => diagnosisById.get(id))
        .filter((d): d is Diagnosis => d !== undefined),
    };
  });
}

/**
 * The handful of figures worth showing without being asked.
 *
 * The full set runs past twenty tiles, which is a wall rather than a summary —
 * the three numbers that changed get the same weight as the seventeen that did
 * not. These are the ones a dentist checks daily regardless of whether anything
 * is wrong; the rest stay one click away.
 */
export const HEADLINE_METRIC_KEYS: readonly string[] = [
  "appointments.total_today",
  "treatment.completed_today",
  "revenue.collected_today",
  "revenue.outstanding",
  "capacity.chair_utilization",
  "queue.patients_waiting",
];

/** Headline metrics, in the fixed order above; absent ones simply do not show. */
export function headlineMetrics(metrics: readonly Metric[]): readonly Metric[] {
  return HEADLINE_METRIC_KEYS.map((key) =>
    metrics.find((m) => m.id.startsWith(`${key}:`)),
  ).filter((m): m is Metric => m !== undefined);
}
