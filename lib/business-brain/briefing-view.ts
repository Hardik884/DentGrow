/**
 * lib/business-brain/briefing-view.ts
 *
 * The projection behind the redesigned Morning Briefing.
 *
 * The page has exactly two columns — Problems (left) and Actions (right) — so
 * this file produces exactly two lists, paired by problem id. Everything here is
 * plain language a dentist or receptionist reads without translation: no
 * "constraint", "signal", "diagnosis", "confidence" or any other word from the
 * machinery that produced it. Those words are correct inside the engine and
 * wrong on this page.
 *
 * It decides nothing. Severity, ordering and what counts as a problem all arrive
 * already settled from the pipeline; this only renames and reshapes.
 */

import type { ActionDraftKind, BusinessBrainResult, Metric, Severity } from "@/business-brain";
import { BRIEFING_MESSAGE_KINDS } from "@/lib/messaging/templates";

// ── Left column: one problem, in plain words ─────────────────────────────────

export interface ProblemView {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  /** One short line naming the problem, with a real number where we have one. */
  readonly summary: string;
  /** A short paragraph: what it means and why it matters. */
  readonly explanation: string;
  /** The formatted figure at stake, or null when it could not be measured. */
  readonly atStake: string | null;
  readonly atStakeLabel: string | null;
  /** Practical, shown only when the card is expanded. */
  readonly howToFix: string;
  /** Plain evidence, shown only when the card is expanded. */
  readonly whyWeThink: string;
}

// ── Right column: one thing to do, with a checklist ──────────────────────────

export interface ChecklistItem {
  readonly id: string;
  readonly label: string;
}

export interface BriefingButton {
  readonly label: string;
  readonly href: string;
}

export interface ActionCardView {
  readonly id: string;
  /** The problem this action resolves — pairs it with the left column. */
  readonly problemId: string;
  readonly category: string;
  readonly title: string;
  readonly reason: string;
  readonly checklist: readonly ChecklistItem[];
  readonly primary: BriefingButton | null;
  readonly secondary: BriefingButton | null;
  readonly ownerLabel: string;
  readonly timeframeLabel: string;
  /** Short past-tense phrase for the score-change toast, e.g. "Payment recorded". */
  readonly doneReason: string;
  /**
   * Set when this card's patients can be reached with a prepared WhatsApp
   * message (recall, payment reminder, next-visit). Drives the "Prepare WhatsApp
   * reminders" affordance; absent categories have no per-patient message.
   */
  readonly messageKind?: ActionDraftKind;
}

export interface BriefingView {
  readonly problems: readonly ProblemView[];
  readonly actions: readonly ActionCardView[];
}

// ── Plain-language copy, keyed by problem category ───────────────────────────

interface CategoryCopy {
  readonly title: string;
  readonly explanation: string;
  readonly howToFix: string;
  readonly whyWeThink: string;
  /** Fallback summary when no live count is available for this category. */
  readonly summaryFallback: string;
  readonly atStakeLabel: string | null;
}

const COPY: Record<string, CategoryCopy> = {
  revenue_leakage: {
    title: "Patients owe money for completed work",
    explanation:
      "This is money the clinic has already earned but hasn't collected. The longer a balance sits unpaid, the harder it usually gets to recover.",
    howToFix:
      "Work through the unpaid balances, oldest first, and follow up with each patient to arrange payment.",
    whyWeThink: "Patients have completed treatment on record with no matching payment.",
    summaryFallback: "Some completed work hasn't been paid for.",
    atStakeLabel: "owed",
  },
  treatment_acceptance: {
    title: "Patients haven't booked their next visit",
    explanation:
      "These patients started or planned treatment but have nothing booked next. Unless someone contacts them, they may not come back to finish.",
    howToFix:
      "Open the list of planned treatments and book a next visit for each patient who doesn't have one.",
    whyWeThink: "There's planned treatment on record for patients with nothing on the calendar.",
    summaryFallback: "Some patients with planned treatment have no next visit.",
    atStakeLabel: "in planned treatment",
  },
  capacity: {
    title: "Your chair was empty today",
    explanation:
      "Chairs sat unused during opening hours. Empty chair time is capacity — and income — that can't be recovered later.",
    howToFix:
      "Fill open slots by bringing forward planned treatments or offering appointments to patients who are due.",
    whyWeThink: "Booked time today was well below the hours the clinic was open.",
    summaryFallback: "The clinic had unused chair time today.",
    atStakeLabel: "of empty chair time today",
  },
  scheduling: {
    title: "Patients cancelled or didn't show up",
    explanation:
      "Booked slots went unused because patients cancelled late or didn't arrive. Each lost slot is a patient not treated and a gap that's hard to fill at short notice.",
    howToFix:
      "Confirm tomorrow's appointments in advance, and offer freed-up slots to patients on your waiting list.",
    whyWeThink: "The share of appointments cancelled or missed was higher than normal.",
    summaryFallback: "More appointments than usual were lost.",
    atStakeLabel: "appointments lost today",
  },
  retention: {
    title: "Patients have stopped coming back",
    explanation:
      "Existing patients aren't returning at the usual rate. Returning patients are the steadiest source of work, so a drop here tends to show up in income later.",
    howToFix: "Reach out to patients who are overdue for a check-up and invite them back in.",
    whyWeThink: "Return visits are down while overdue recalls are building up.",
    summaryFallback: "Fewer patients are coming back than usual.",
    atStakeLabel: "patients overdue",
  },
  acquisition: {
    title: "Fewer new patients than usual",
    explanation:
      "Fewer new patients registered than this clinic usually sees. New patients are how a practice grows and replaces the ones who naturally move on.",
    howToFix:
      "Check that enquiries are being followed up promptly and that referral sources are still active.",
    whyWeThink: "New registrations were lower than this clinic's normal.",
    summaryFallback: "New patient numbers are below normal.",
    atStakeLabel: null,
  },
};

// ── Live counts for concrete summaries ───────────────────────────────────────

function metricValue(metrics: readonly Metric[], key: string): number | null {
  const m = metrics.find((x) => x.id.startsWith(`${key}:`));
  return m ? m.value : null;
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/**
 * A concrete, numbered summary line for a category, or the fallback.
 *
 * `patientCount`, when given for a category, is the DISTINCT-patient count and
 * wins over the raw metric. The metric behind treatment/retention counts rows
 * (treatments, follow-ups), so a patient with several planned treatments would
 * inflate it; the briefing states patients, so it must count patients. This is
 * what keeps "14 patients have planned treatment" agreeing with the send list.
 */
function summaryFor(
  category: string,
  copy: CategoryCopy,
  metrics: readonly Metric[],
  patientCount?: number,
): string {
  const count = (v: number | null, one: string, many: string) => {
    if (v === null || v <= 0) return null;
    const n = Math.round(v);
    return n === 1 ? one : many.replace("{n}", String(n));
  };

  if (category === "revenue_leakage") {
    const v = metricValue(metrics, "revenue.outstanding");
    if (v && v > 0) return `${rupees(v)} is owed for treatment that's already been done.`;
  }
  if (category === "treatment_acceptance") {
    const s = count(
      patientCount ?? metricValue(metrics, "treatment.accepted_pending_scheduling"),
      "1 patient has planned treatment but no next visit.",
      "{n} patients have planned treatment but no next visit.",
    );
    if (s) return s;
  }
  if (category === "retention") {
    const s = count(
      patientCount ?? metricValue(metrics, "followups.overdue"),
      "1 patient has a follow-up due.",
      "{n} patients have a follow-up due.",
    );
    if (s) return s;
  }
  return copy.summaryFallback;
}

/** Format an at-stake amount the way a clinic would say it aloud. */
function formatAtStake(amount: number, unit: string): string {
  if (unit === "currency") return rupees(amount);
  if (unit === "minutes") {
    const hours = Math.floor(amount / 60);
    const minutes = Math.round(amount % 60);
    if (hours === 0) return `${minutes} min`;
    return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
  }
  return `${Math.round(amount)}`;
}

// ── Right-column button routing ──────────────────────────────────────────────
//
// Every button is a deep-link into the real DentGrow screen where the work
// actually happens — the same "prepare, never perform" behaviour the whole
// system is built on. Doing the work there changes the underlying data, which is
// what makes the problem and the score move on the next load.

const PRIMARY_ROUTE: Record<string, BriefingButton> = {
  revenue_leakage: { label: "Open unpaid balances", href: "/dentist/payments" },
  treatment_acceptance: { label: "Open planned treatments", href: "/dentist/treatments?status=planned" },
  capacity: { label: "Open the schedule", href: "/dentist/appointments" },
  scheduling: { label: "Open appointments", href: "/dentist/appointments" },
  retention: { label: "Open overdue recalls", href: "/dentist/follow-ups?status=pending" },
  acquisition: { label: "Open patients", href: "/dentist/patients" },
};

const SECONDARY_ROUTE: Record<string, BriefingButton> = {
  revenue_leakage: { label: "Record a payment", href: "/dentist/payments/new" },
  treatment_acceptance: { label: "Book an appointment", href: "/dentist/appointments/new" },
  retention: { label: "Create a follow-up", href: "/dentist/follow-ups/new" },
};

// ── Build ────────────────────────────────────────────────────────────────────

const OWNER_HINT: Record<string, string> = {
  revenue_leakage: "Front desk",
  treatment_acceptance: "Front desk",
  capacity: "Front desk",
  scheduling: "Front desk",
  retention: "Front desk",
  acquisition: "Front desk",
};

const DONE_REASON: Record<string, string> = {
  revenue_leakage: "Payments followed up",
  treatment_acceptance: "Next visits booked",
  capacity: "Schedule filled",
  scheduling: "Appointments confirmed",
  retention: "Recalls actioned",
  acquisition: "Enquiries followed up",
};

/**
 * Project one pipeline run into the two-column briefing.
 *
 * `metrics` is passed alongside the result so problem summaries can name a real
 * count ("3 patients overdue") rather than a vague phrase — the same live
 * numbers the health score reads, so the two never disagree.
 */
export function buildBriefing(
  result: BusinessBrainResult,
  metrics: readonly Metric[],
  patientCounts?: Readonly<Partial<Record<string, number>>>,
): BriefingView {
  const problems: ProblemView[] = [];
  const actions: ActionCardView[] = [];

  for (const constraint of result.constraints) {
    const copy = COPY[constraint.category];
    const values = result.valueAtStake.get(constraint.id);
    const value = values?.[0];
    const atStake = value ? formatAtStake(value.amount, value.unit) : null;
    const patientCount = patientCounts?.[constraint.category];

    problems.push({
      id: constraint.id,
      title: copy?.title ?? constraint.name,
      severity: constraint.severity,
      summary: copy ? summaryFor(constraint.category, copy, metrics, patientCount) : constraint.description,
      explanation: copy?.explanation ?? "",
      atStake,
      atStakeLabel: atStake ? (copy?.atStakeLabel ?? null) : null,
      howToFix: copy?.howToFix ?? "",
      whyWeThink: copy?.whyWeThink ?? "",
    });

    // The matching workflow supplies the concrete checklist steps.
    const workflow = result.workflows.find((w) => w.constraintId === constraint.id);
    const checklist: ChecklistItem[] = (workflow?.tasks ?? []).map((t) => ({
      id: t.id,
      label: t.instruction,
    }));

    actions.push({
      id: `action-${constraint.id}`,
      problemId: constraint.id,
      category: constraint.category,
      title: copy?.title ?? constraint.name,
      reason: copy ? summaryFor(constraint.category, copy, metrics, patientCount) : constraint.description,
      checklist,
      primary: PRIMARY_ROUTE[constraint.category] ?? null,
      secondary: SECONDARY_ROUTE[constraint.category] ?? null,
      ownerLabel: OWNER_HINT[constraint.category] ?? "Front desk",
      timeframeLabel: constraint.severity === "critical" || constraint.severity === "high" ? "Today" : "This week",
      doneReason: DONE_REASON[constraint.category] ?? "Handled",
      messageKind: (BRIEFING_MESSAGE_KINDS as Record<string, ActionDraftKind>)[constraint.category],
    });
  }

  return { problems, actions };
}
