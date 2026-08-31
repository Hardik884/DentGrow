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

import type {
  ActionDraftKind,
  BusinessBrainResult,
  Constraint,
  Metric,
  Severity,
} from "@/business-brain";
import { WorkflowOwner } from "@/business-brain";
import { BRIEFING_MESSAGE_KINDS } from "@/lib/messaging/templates";

// ── Left column: one problem, in plain words ─────────────────────────────────

export interface ProblemView {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  /**
   * The constraint category this card is about, e.g. "revenue_leakage".
   *
   * Surfaced so the card can offer a snooze: a dismissal is recorded against the
   * category and the severity, and both have to travel with the card for the
   * control to say what it is actually suppressing.
   */
  readonly category: string;
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

/**
 * Which inline action a button performs. The button itself (which dialog it
 * opens) is rendered by ActionCard — this is just the discriminator.
 */
export type PrimaryActionKind = "contact_patients" | "book_appointment" | "create_follow_up";

export interface PrimaryAction {
  readonly kind: PrimaryActionKind;
  readonly label: string;
}

export interface ActionCardView {
  readonly id: string;
  /** The problem this action resolves — pairs it with the left column. */
  readonly problemId: string;
  readonly category: string;
  /** Action-oriented heading — what to DO, never a restatement of the problem. */
  readonly title: string;
  readonly reason: string;
  readonly checklist: readonly ChecklistItem[];
  /**
   * Every directly-executable inline action for this diagnosis, in priority
   * order — a card can offer more than one when more than one genuinely
   * applies (e.g. a planned-treatment patient can be contacted OR booked
   * directly). Empty when nothing is directly executable; ActionCard renders
   * the first entry as the visually primary button and any further entries
   * as secondary buttons alongside it, never competing for top billing.
   */
  readonly primaryActions: readonly PrimaryAction[];
  /** Secondary "see the full list" link, shown inside the Steps dropdown. */
  readonly moreInfoLink: BriefingButton | null;
  readonly ownerLabel: string;
  readonly timeframeLabel: string;
  /** Short past-tense phrase for the score-change toast, e.g. "Payment recorded". */
  readonly doneReason: string;
  /**
   * Set when this card's patients can be reached with a prepared WhatsApp
   * message (recall, payment reminder, next-visit). Drives the inline
   * "Contact Patients" action when `primaryActions` includes it; absent
   * categories have no per-patient message.
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
  forward_schedule: {
    title: "Next week is filling up slowly",
    explanation:
      "Less of next week's chair time is booked than usual. This is the one thing here you can still change before it happens — every other item describes a day that's already gone.",
    howToFix:
      "Call patients with planned treatment and patients who are overdue for a check-up, and offer them a specific slot from next week's open time.",
    whyWeThink: "Less of the chair time offered over the next 7 days is booked than this clinic normally has by now.",
    summaryFallback: "Next week has more open chair time than usual.",
    // No at-stake figure: what is at stake is chair time, and nothing measures
    // the minutes the coming week offers. The real number lives in the summary
    // line as a share instead. See ConstraintCategory.FORWARD_SCHEDULE.
    atStakeLabel: null,
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

/**
 * Action-card headings, keyed the same as COPY but answering a different
 * question. COPY.title says what's WRONG ("Patients owe money for completed
 * work"); this says what to DO about it ("Follow up on outstanding
 * payments") — the two must never be the same string, or the right column
 * just echoes the left one instead of telling the dentist what to click.
 */
const ACTION_TITLE: Record<string, string> = {
  revenue_leakage: "Follow up on outstanding payments",
  treatment_acceptance: "Bring planned treatments back onto the schedule",
  capacity: "Fill your open chair time",
  scheduling: "Recover today's lost appointments",
  retention: "Reach out to patients who are overdue",
  acquisition: "Give new enquiries a closer look",
  forward_schedule: "Fill next week's open slots",
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
  if (category === "forward_schedule") {
    // Checked against null rather than truthiness: a week that is 0% booked is
    // the most urgent version of this finding, not a missing measurement.
    const v = metricValue(metrics, "capacity.booked_next_7d");
    if (v !== null) return `Only ${Math.round(v)}% of next week's chair time is booked.`;
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

// ── Right-column actions ──────────────────────────────────────────────────────
//
// Each category gets every directly-executable action that genuinely applies
// to it — opened inline (as a dialog) by ActionCard, never a navigation. A
// category can list more than one (a planned-treatment patient can be
// contacted about booking, or booked directly); "acquisition" has none,
// because there is no inline action that fixes "fewer new patients than
// usual" today. Order matters: the FIRST entry is the one ActionCard renders
// as the visually primary button; any further entries render as secondary
// buttons beside it, never competing for top billing.
//
// `moreInfoLink` is a secondary, lower-emphasis deep-link into the full list
// view for whoever wants to work through every record by hand — shown inside
// the "Steps" dropdown, never as a competing primary button.

const PRIMARY_ACTIONS: Partial<Record<string, readonly PrimaryActionKind[]>> = {
  revenue_leakage: ["contact_patients"],
  treatment_acceptance: ["contact_patients", "book_appointment"],
  retention: ["contact_patients", "create_follow_up"],
  capacity: ["book_appointment"],
  scheduling: ["book_appointment"],
  // Booking only, deliberately. Filling next week means calling patients with
  // planned treatment or an overdue recall — but those are exactly the
  // populations the treatment_acceptance and retention cards already own, each
  // with its own prepared message. There is no "next week is thin" message,
  // because the thing you say depends on which of those two lists the patient is
  // on, and ActionCard drops a contact button with no message kind anyway. The
  // checklist under Steps sends staff to both lists.
  forward_schedule: ["book_appointment"],
  // acquisition: no directly-executable action exists today.
};

const PRIMARY_ACTION_LABEL: Record<PrimaryActionKind, string> = {
  contact_patients: "Contact Patients",
  book_appointment: "Book Appointment",
  create_follow_up: "Create Follow-up",
};

const MORE_INFO_LINK: Record<string, BriefingButton> = {
  revenue_leakage: { label: "Open unpaid balances", href: "/dentist/payments" },
  treatment_acceptance: { label: "Open planned treatments", href: "/dentist/treatments?status=planned" },
  capacity: { label: "Open the schedule", href: "/dentist/appointments" },
  scheduling: { label: "Open appointments", href: "/dentist/appointments" },
  retention: { label: "Open overdue recalls", href: "/dentist/follow-ups?status=pending" },
  acquisition: { label: "Open patients", href: "/dentist/patients" },
  forward_schedule: { label: "Open next week's schedule", href: "/dentist/appointments" },
};

// ── The one card that says something no other PMS can ────────────────────────

/**
 * Whether the day's idle chair time and its unbooked treatment are the SAME
 * story, according to the engine rather than according to this file.
 *
 * Two cards saying "your chair was empty" and "patients haven't booked" is the
 * view fragmenting one finding into two — the exact thing the Constraint Engine
 * exists to prevent, undone one layer later. But they are only one story when
 * the demand was genuinely there and went unconverted, and that is a judgement
 * this projection has no business making: idle chairs and an unbooked treatment
 * book can also co-occur for unrelated reasons (a day the clinic closed early,
 * a plan raised an hour ago).
 *
 * So it is not inferred from the two constraints being present. It is read from
 * the Diagnosis Engine having SETTLED `unconverted_demand` on
 * `demand_supply_mismatch` — the hypothesis whose supporting evidence is
 * literally "planned treatment demand is at or above its limit while the chair
 * was idle, so demand demonstrably existed on this day". When that is supported,
 * the combination is a measured finding. When it is not, two cards is correct.
 */
function idleChairAndUnbookedTreatmentAreOneStory(result: BusinessBrainResult): boolean {
  return (result.diagnoses ?? []).some(
    (d) =>
      d.pattern === "demand_supply_mismatch" &&
      d.hypotheses.some(
        (h) => h.id.endsWith("#h.unconverted_demand") && h.status === "supported",
      ),
  );
}

/** Minutes as a clinic would say them aloud: "2 hr 30 min", "45 min". */
function spokenMinutes(amount: number): string {
  return formatAtStake(amount, "minutes");
}

/** Worst of two severities wins, matching the Constraint Engine's own rule. */
const SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"];
function worstOf(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER.indexOf(b) > SEVERITY_ORDER.indexOf(a) ? b : a;
}

/**
 * The sentence a general scheduling tool cannot say and a general CRM cannot
 * say: how much chair time is going unused, and exactly who could fill it.
 *
 * It is only sayable by something that owns the appointment ledger and the
 * treatment ledger at once, which is the whole argument for this being one
 * product rather than two integrations.
 */
function mergedSummary(
  result: BusinessBrainResult,
  capacity: Constraint,
  metrics: readonly Metric[],
  patientCounts?: Readonly<Partial<Record<string, number>>>,
): string {
  const patients =
    patientCounts?.["treatment_acceptance"] ??
    metricValue(metrics, "treatment.accepted_pending_scheduling");
  const idle = result.valueAtStake.get(capacity.id)?.[0];

  const who =
    patients !== null && patients !== undefined && patients > 0
      ? `${Math.round(patients)} patient${Math.round(patients) === 1 ? "" : "s"} with planned treatment ${Math.round(patients) === 1 ? "has" : "have"} no next visit booked`
      : "patients with planned treatment have no next visit booked";

  // Both halves where both were measured; the patient half alone otherwise —
  // never a fabricated "0 minutes", which would read as a full day.
  return idle && idle.amount > 0
    ? `${spokenMinutes(idle.amount)} of chair time went unused today, and ${who}.`
    : `${who}, while chair time went unused today.`;
}

function mergedProblem(
  result: BusinessBrainResult,
  capacity: Constraint,
  acceptance: Constraint,
  metrics: readonly Metric[],
  patientCounts?: Readonly<Partial<Record<string, number>>>,
): ProblemView {
  // The money already on the books is the headline, not the idle minutes: it is
  // the figure that makes the case for acting today, and the minutes are stated
  // in the summary line right beneath it.
  const pending = result.valueAtStake.get(acceptance.id)?.[0];

  return {
    id: capacity.id,
    title: "Your chair sat idle while patients were waiting to be booked",
    severity: worstOf(capacity.severity, acceptance.severity),
    // Snoozing the merged card suppresses the capacity constraint it is keyed
    // to; the treatment-acceptance half is folded into it and travels with it.
    category: capacity.category,
    summary: mergedSummary(result, capacity, metrics, patientCounts),
    explanation:
      "These are not two problems. The treatment these patients have already planned is the work that would have filled today's empty chair time — the demand existed and simply never got booked in.",
    atStake: pending ? formatAtStake(pending.amount, pending.unit) : null,
    atStakeLabel: pending ? "in planned treatment, unbooked" : null,
    howToFix:
      "Work the planned-treatment list against your open slots: call each patient who has no next visit and offer them a specific time from the gaps in this week's schedule.",
    whyWeThink:
      "Chair time went unused on a day when patients with planned treatment had nothing booked, so the demand to fill it was already on your own books.",
  };
}

function mergedAction(
  result: BusinessBrainResult,
  capacity: Constraint,
  acceptance: Constraint,
  metrics: readonly Metric[],
  patientCounts?: Readonly<Partial<Record<string, number>>>,
): ActionCardView {
  // The treatment-acceptance workflow is the one with the steps that actually
  // fill a chair (pull the list, call, offer a specific time). The capacity
  // workflow's steps are about why the chair was empty, which this card has
  // already answered.
  const workflow =
    result.workflows.find((w) => w.constraintId === acceptance.id) ??
    result.workflows.find((w) => w.constraintId === capacity.id);

  return {
    id: `action-${capacity.id}`,
    problemId: capacity.id,
    // Keyed to treatment_acceptance so the WhatsApp population, the reminder
    // summary and the "already contacted" count all resolve to the patients this
    // card is actually about.
    category: "treatment_acceptance",
    title: "Fill today's gaps from your own planned treatments",
    reason: mergedSummary(result, capacity, metrics, patientCounts),
    checklist: (workflow?.tasks ?? []).map((t) => ({ id: t.id, label: t.instruction })),
    primaryActions: (PRIMARY_ACTIONS["treatment_acceptance"] ?? []).map((kind) => ({
      kind,
      label: PRIMARY_ACTION_LABEL[kind],
    })),
    moreInfoLink: MORE_INFO_LINK["treatment_acceptance"] ?? null,
    ownerLabel: workflow ? (OWNER_LABEL[workflow.owner] ?? "You") : "You",
    timeframeLabel: "Today",
    doneReason: "Chair time filled",
    messageKind: (BRIEFING_MESSAGE_KINDS as Record<string, ActionDraftKind>)["treatment_acceptance"],
  };
}

// ── Build ────────────────────────────────────────────────────────────────────

/**
 * Who the card is addressed to.
 *
 * This page is dentist-only — `/dentist/business-brain` is gated by the route
 * AND by middleware — so the reader is always the dentist. Every card used to be
 * stamped "Front desk" regardless, which said, in writing, that a role which
 * cannot open the page was on top of the work. That is the contradiction this
 * map exists to remove: the chip now addresses the person actually reading it.
 *
 * The underlying ownership is not thrown away, which is the other half of the
 * fix. The Workflow Engine already decides per workflow whether the dentist or
 * the front desk should do the job (14 templates say dentist, 23 say
 * receptionist), and the view previously discarded that real judgement in favour
 * of one hard-coded string. Now it is read: "You" for the dentist's own work,
 * "Delegate" for work that belongs at the front desk and therefore has to be
 * handed over rather than merely noticed.
 *
 * Kept to one word because it renders as a small uppercase chip beside the
 * timeframe.
 */
const OWNER_LABEL: Record<WorkflowOwner, string> = {
  [WorkflowOwner.DENTIST]: "You",
  [WorkflowOwner.RECEPTIONIST]: "Delegate",
  // The clinic decides based on staffing; from the dentist's side that is still
  // theirs to place, so it reads the same as their own work.
  [WorkflowOwner.EITHER]: "You",
};

const DONE_REASON: Record<string, string> = {
  revenue_leakage: "Payments followed up",
  treatment_acceptance: "Next visits booked",
  capacity: "Schedule filled",
  scheduling: "Appointments confirmed",
  retention: "Recalls actioned",
  acquisition: "Enquiries followed up",
  forward_schedule: "Next week filled",
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
  /**
   * Categories the clinic has snoozed and that are still suppressed.
   *
   * Resolved by the caller rather than here, because deciding it needs the
   * database (which dismissals are live) and the escalation rule (whether the
   * problem has since got worse) — see lib/business-brain/dismissals.ts. This
   * projection stays a pure function of the run so it remains testable without a
   * session, and so a dismissal can never reach the engines.
   *
   * The run itself is untouched: the metric, signal and diagnosis behind a
   * suppressed card are all still computed, still traced, still recorded in
   * history. Only the card is withheld.
   */
  suppressedCategories?: ReadonlySet<string>,
): BriefingView {
  const problems: ProblemView[] = [];
  const actions: ActionCardView[] = [];

  // When the engine has settled that the idle chair and the unbooked treatment
  // are one story, they are presented as one. The capacity constraint carries
  // it, because the diagnosis that licenses the merge (demand_supply_mismatch)
  // is the one that groups there — so treatment_acceptance is folded in and
  // skipped below rather than repeating half the same finding.
  const merged =
    idleChairAndUnbookedTreatmentAreOneStory(result) &&
    result.constraints.some((c) => c.category === "capacity") &&
    result.constraints.some((c) => c.category === "treatment_acceptance");

  for (const constraint of result.constraints) {
    // A snoozed category is filtered here, at the very end of the pipeline. The
    // merged card is keyed to `capacity`, so snoozing it suppresses the pair.
    if (suppressedCategories?.has(constraint.category)) continue;
    if (merged && constraint.category === "treatment_acceptance") continue;

    if (merged && constraint.category === "capacity") {
      const acceptance = result.constraints.find((c) => c.category === "treatment_acceptance")!;
      problems.push(mergedProblem(result, constraint, acceptance, metrics, patientCounts));
      actions.push(mergedAction(result, constraint, acceptance, metrics, patientCounts));
      continue;
    }

    const copy = COPY[constraint.category];
    const values = result.valueAtStake.get(constraint.id);
    const value = values?.[0];
    const patientCount = patientCounts?.[constraint.category];

    // Retention's headline number must name the SAME population as its summary
    // line and the "Open overdue recalls" action list — distinct patients with
    // an overdue follow-up — not the reactivation-candidate figure the Value
    // Engine uses to size and rank the constraint internally (audit A9). Sourcing
    // it here, in the view, keeps the deterministic engine and its ranking
    // untouched while making the card reconcile with the work it links to.
    let atStake: string | null;
    if (constraint.category === "retention") {
      const overdue = patientCount ?? metricValue(metrics, "followups.overdue");
      atStake = overdue !== null && overdue > 0 ? formatAtStake(overdue, "count") : null;
    } else {
      atStake = value ? formatAtStake(value.amount, value.unit) : null;
    }

    problems.push({
      id: constraint.id,
      title: copy?.title ?? constraint.name,
      severity: constraint.severity,
      category: constraint.category,
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

    const primaryActions: PrimaryAction[] = (PRIMARY_ACTIONS[constraint.category] ?? []).map((kind) => ({
      kind,
      label: PRIMARY_ACTION_LABEL[kind],
    }));

    actions.push({
      id: `action-${constraint.id}`,
      problemId: constraint.id,
      category: constraint.category,
      title: ACTION_TITLE[constraint.category] ?? copy?.title ?? constraint.name,
      reason: copy ? summaryFor(constraint.category, copy, metrics, patientCount) : constraint.description,
      checklist,
      primaryActions,
      moreInfoLink: MORE_INFO_LINK[constraint.category] ?? null,
      // Falls back to "You": with no workflow there is nothing to hand over, and
      // the dentist is the only person who can see the card anyway.
      ownerLabel: workflow ? (OWNER_LABEL[workflow.owner] ?? "You") : "You",
      timeframeLabel: constraint.severity === "critical" || constraint.severity === "high" ? "Today" : "This week",
      doneReason: DONE_REASON[constraint.category] ?? "Handled",
      messageKind: (BRIEFING_MESSAGE_KINDS as Record<string, ActionDraftKind>)[constraint.category],
    });
  }

  return { problems, actions };
}
