/**
 * lib/business-brain/clinic-health.ts
 *
 * The Clinic Health Score — a single 0–100 read of how the clinic is doing today.
 *
 * A NOTE ON WHY THIS EXISTS, given dashboard-view.ts once argued against it.
 * --------------------------------------------------------------------------
 * The Morning Briefing deliberately avoided a numeric score for a long time, on
 * a real principle: "a composite over inputs that have not been individually
 * validated produces a number nobody can explain, and the first time it
 * disagrees with what the dentist sees the whole dashboard loses credibility."
 *
 * That objection is correct, and this module is built to satisfy it rather than
 * ignore it. Every point this score removes is:
 *
 *   1. Measured directly from a live clinic fact — an actual count of overdue
 *      recalls, the actual rupees outstanding — not inferred from a statistical
 *      pattern. A dentist can read "-9: 3 patients overdue for a recall" and
 *      check it against reality in ten seconds.
 *   2. Itemised. The score is never a lone number; it always ships with the
 *      list of deductions that produced it, so it is explainable by construction.
 *   3. Un-gameable. Because each factor is a live measurement, ticking a
 *      checkbox on screen changes nothing. Only genuinely doing the work — the
 *      payment recorded, the visit booked, the recall completed — moves the
 *      underlying number, and therefore the score, on the next page load.
 *   4. Recomputed, never stored. The score is a pure function of the metrics
 *      already fetched for the page, so it can never drift from live data. There
 *      is no write here and nothing to keep in sync.
 *
 * The score does NOT read the pipeline's diagnosed "problems" (constraints).
 * That is deliberate: a diagnosed problem only appears once a pattern trips,
 * whereas a clinic can have three overdue recalls and nothing else wrong. The
 * score measures the concrete facts underneath the problems, so it is always
 * present and never double-counts a fact against the pattern built from it.
 */

import type { Metric } from "@/business-brain";

export type HealthBand = "excellent" | "good" | "attention" | "urgent";

export interface HealthDeduction {
  /** Stable id for the factor, for keys and testing. */
  readonly factor: string;
  /** What was found, in the words a clinic would use. */
  readonly detail: string;
  /** Points removed (a positive number; the score subtracts it). */
  readonly points: number;
}

export interface ClinicHealth {
  /** 0–100, higher is healthier. */
  readonly score: number;
  readonly band: HealthBand;
  /** "Excellent" / "Good" / "Needs Attention" / "Urgent". */
  readonly bandLabel: string;
  /** Every point removed, itemised, worst first. Empty means a perfect day. */
  readonly deductions: readonly HealthDeduction[];
}

/**
 * Distinct-patient counts for the two factors that speak of "patients". The
 * underlying metrics count treatment/follow-up ROWS, so a patient with several
 * planned treatments or overdue recalls would be counted more than once. When the
 * page can supply the deduped patient count (from the reminder summaries), the
 * breakdown uses it, so "N patients" here means the same N the problem cards and
 * the "Patients to contact" list show — never an inflated row count.
 */
export interface HealthContext {
  readonly patientCounts?: {
    /** Distinct patients with planned treatment and no next visit. */
    readonly noNextVisit?: number | null;
    /** Distinct patients with an overdue recall follow-up. */
    readonly overdueFollowups?: number | null;
  };
}

// ── Reading a metric value ────────────────────────────────────────────────────

/**
 * Metric ids are "<key>:<clinicId>:<date>", so we match on the key prefix — the
 * same lookup the headline metrics already use. A withheld metric (one the
 * engine could not measure) is simply absent from the array, and returns null
 * here, which every factor treats as "nothing to deduct" rather than "zero".
 */
function metricValue(metrics: readonly Metric[], key: string): number | null {
  const m = metrics.find((x) => x.id.startsWith(`${key}:`));
  return m ? m.value : null;
}

// ── The rubric ────────────────────────────────────────────────────────────────
//
// Each factor reads one live fact and returns how many points to remove, capped
// so no single category can sink the whole score on its own. Weights reflect
// business impact: uncollected cash and lost patients hurt most; a quiet chair
// or a slow queue on one day hurts least. The caps below sum to 74, so a clinic
// where everything is wrong still floors around 26 rather than 0 — a health
// score of zero would be as uninformative as one of a hundred.

interface HealthFactor {
  readonly id: string;
  /** Returns the deduction for this factor, or null if there is nothing to remove. */
  readonly evaluate: (metrics: readonly Metric[], ctx: HealthContext) => HealthDeduction | null;
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const FACTORS: readonly HealthFactor[] = [
  // Money already earned but not collected. The single highest-impact factor:
  // it is cash the clinic is owed today, and it drops the moment a payment is
  // recorded. Banded rather than per-rupee so a small balance is a nudge and a
  // large one is a real dent, without a linear rule making every clinic look bad.
  {
    id: "outstanding_balance",
    evaluate: (m) => {
      const v = metricValue(m, "revenue.outstanding");
      if (v === null || v <= 0) return null;
      const points = v >= 50000 ? 18 : v >= 25000 ? 12 : v >= 10000 ? 6 : 2;
      return { factor: "Unpaid balances", detail: `${rupees(v)} owed for completed work`, points };
    },
  },

  // Patients who finished or started treatment but have no next visit booked.
  // Each one is a patient who may never come back unless someone calls. Drops
  // as soon as a visit is booked for them.
  {
    id: "no_next_visit",
    evaluate: (m, ctx) => {
      // Prefer the distinct-patient count when the page supplies it; the raw
      // metric counts treatment rows, which would read as more "patients" than
      // there are and disagree with the action list.
      const override = ctx.patientCounts?.noNextVisit;
      const v = override != null ? override : metricValue(m, "treatment.accepted_pending_scheduling");
      if (v === null || v <= 0) return null;
      const n = Math.round(v);
      const points = Math.min(15, n * 3);
      return {
        factor: "No next visit booked",
        detail: `${n} patient${n === 1 ? "" : "s"} have planned treatment but no next appointment`,
        points,
      };
    },
  },

  // Recalls that are past due. Retention is the cheapest revenue in dentistry,
  // and an overdue recall is a patient quietly slipping away. Drops as each
  // recall is completed or the patient is rebooked.
  {
    id: "overdue_followups",
    evaluate: (m, ctx) => {
      // Distinct patients when available; the metric counts follow-up rows.
      const override = ctx.patientCounts?.overdueFollowups;
      const v = override != null ? override : metricValue(m, "followups.overdue");
      if (v === null || v <= 0) return null;
      const n = Math.round(v);
      const points = Math.min(15, n * 3);
      return {
        factor: "Overdue recalls",
        detail: `${n} patient${n === 1 ? "" : "s"} overdue for a check-up reminder`,
        points,
      };
    },
  },

  // How often booked patients simply do not turn up, over the last month. A
  // 30-day rate rather than today's count, so it reflects a habit rather than
  // one bad morning — which also means it improves gradually, not instantly.
  {
    id: "no_show_rate",
    evaluate: (m) => {
      const v = metricValue(m, "scheduling.no_show_rate_30d");
      if (v === null || v <= 10) return null;
      const points = v > 30 ? 12 : v > 20 ? 8 : 4;
      return {
        factor: "No-shows",
        detail: `${Math.round(v)}% of appointments were no-shows this month`,
        points,
      };
    },
  },

  // How much of today's chair time actually got used. Lightly weighted because
  // a single day swings a lot; a genuinely quiet day should register, not
  // dominate.
  {
    id: "chair_utilization",
    evaluate: (m) => {
      const v = metricValue(m, "capacity.chair_utilization");
      if (v === null || v >= 70) return null;
      const points = v < 30 ? 8 : v < 50 ? 5 : 2;
      return {
        factor: "Empty chair time",
        detail: `Chairs were only ${Math.round(v)}% used today`,
        points,
      };
    },
  },

  // How long patients are sitting in the waiting room today. A live
  // patient-experience harm that clears itself as the queue moves.
  {
    id: "waiting_time",
    evaluate: (m) => {
      const v = metricValue(m, "queue.average_waiting_time");
      if (v === null || v <= 30) return null;
      const points = v > 45 ? 6 : 3;
      return {
        factor: "Long waits",
        detail: `Patients waited ${Math.round(v)} minutes on average today`,
        points,
      };
    },
  },
];

// ── Bands ─────────────────────────────────────────────────────────────────────

function bandFor(score: number): { band: HealthBand; label: string } {
  if (score >= 85) return { band: "excellent", label: "Excellent" };
  if (score >= 70) return { band: "good", label: "Good" };
  if (score >= 55) return { band: "attention", label: "Needs Attention" };
  return { band: "urgent", label: "Urgent" };
}

/**
 * Compute the clinic's health from the day's already-fetched metrics.
 *
 * Pure and deterministic: the same metrics always produce the same score and the
 * same itemised breakdown. No I/O, no clock, no writes.
 */
export function computeClinicHealth(
  metrics: readonly Metric[],
  ctx: HealthContext = {},
): ClinicHealth {
  const deductions = FACTORS.map((f) => f.evaluate(metrics, ctx))
    .filter((d): d is HealthDeduction => d !== null)
    .sort((a, b) => b.points - a.points);

  const removed = deductions.reduce((sum, d) => sum + d.points, 0);
  const score = Math.max(0, Math.min(100, 100 - removed));
  const { band, label } = bandFor(score);

  return { score, band, bandLabel: label, deductions };
}
