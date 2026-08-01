/**
 * Business Brain — Workflow Engine
 *
 * Transforms strategies into structured execution plans that clinic staff can
 * actually follow.
 *
 * ## Design Principles
 *
 * 1. DETERMINISTIC. Same strategies → same workflows, byte for byte.
 *    No AI, no clock (passed in), no I/O, no randomness.
 *
 * 2. STRATEGY-FIRST. Every workflow traces back to exactly one strategy, which
 *    itself traces back to constraints, diagnoses, and signals. The full chain
 *    is auditable: "why am I doing this?" → the workflow's reason → the
 *    strategy's rationale → the diagnosis's evidence → the signals that fired.
 *
 * 3. ACTIONABLE. A workflow is not advice. It is a sequenced list of concrete
 *    steps someone can complete in a morning. Each step is an imperative
 *    sentence a receptionist can read and do without asking what it means.
 *
 * 4. HONEST ABOUT SCOPE. Corrective strategies produce execution workflows.
 *    Investigative strategies produce discovery workflows — shorter, scoped to
 *    answering a question, never pretending to know what to do when the engine
 *    does not.
 *
 * ## What this engine does NOT do
 *
 * - Send messages (WhatsApp, SMS, email)
 * - Execute tasks automatically
 * - Schedule background jobs
 * - Call external APIs
 * - Know about the UI
 *
 * It only CREATES the plan. Execution is a future concern.
 */

import {
  ConstraintCategory,
  type Constraint,
  type Metric,
  type Value,
  type Workflow,
  type WorkflowTask,
  type WorkflowOutcome,
  WorkflowOwner,
  WorkflowEffort,
  WorkflowTimeframe,
  ValueType,
} from "../../domain";
import { Priority } from "../../types";
import type { ReasonedStrategy } from "../strategy";
import { StrategyKind } from "../strategy";

export interface WorkflowResult {
  readonly workflows: readonly Workflow[];
}

/**
 * Workflow templates keyed by the hypothesis slug that a corrective strategy
 * addresses. Each template produces a specific, actionable plan.
 */
interface WorkflowTemplate {
  readonly title: string;
  readonly reason: string;
  readonly owner: WorkflowOwner;
  readonly effort: WorkflowEffort;
  readonly timeframe: WorkflowTimeframe;
  readonly tasks: readonly Omit<WorkflowTask, "id">[];
  readonly outcome: WorkflowOutcome;
}

// ─────────────────────────────────────────────────────────────────────────────
// Corrective workflow templates
//
// One per hypothesis slug. These are the execution plans for strategies the
// engine is confident about — the cause is settled, the action is grounded.
// ─────────────────────────────────────────────────────────────────────────────

const CORRECTIVE_TEMPLATES: Readonly<Record<string, WorkflowTemplate>> = {
  // ── Scheduling ────────────────────────────────────────────────────────────
  cancellation_dominant: {
    title: "Recover recently cancelled appointment slots",
    reason: "Appointments are being lost to cancellations with enough notice to refill",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.TODAY,
    tasks: [
      { order: 1, instruction: "Review cancellations from the last 7 days", hint: "Check Appointments → filter by Cancelled status" },
      { order: 2, instruction: "Identify patients who cancelled with more than 24 hours notice" },
      { order: 3, instruction: "Check which of those slots are still open" },
      { order: 4, instruction: "Contact patients on the standby list and offer the open slots" },
      { order: 5, instruction: "Record outcome for each contact attempt" },
    ],
    outcome: { description: "Recovered appointments and improved chair utilization", valueType: ValueType.APPOINTMENTS_BOOKED },
  },

  no_show_dominant: {
    title: "Confirm tomorrow's appointments",
    reason: "Patients are not showing up without warning, wasting chair time that cannot be refilled",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.TODAY,
    tasks: [
      { order: 1, instruction: "Pull tomorrow's appointment list" },
      { order: 2, instruction: "Call or message each patient to confirm attendance" },
      { order: 3, instruction: "Mark confirmed or unable-to-reach for each" },
      { order: 4, instruction: "For unconfirmed slots, contact standby patients" },
      { order: 5, instruction: "Record which patients could not be reached" },
    ],
    outcome: { description: "Reduced no-shows by confirming attendance in advance", valueType: ValueType.APPOINTMENTS_BOOKED },
  },

  patient_level_pattern: {
    title: "Handle repeat non-attenders",
    reason: "Non-attendance concentrates among patients who have missed before",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Identify patients who missed 2 or more appointments in the last 3 months" },
      { order: 2, instruction: "Contact each to understand their situation" },
      { order: 3, instruction: "Offer same-week booking instead of advance booking" },
      { order: 4, instruction: "Add a confirmation-required flag for their next visit" },
      { order: 5, instruction: "Record outcome of each conversation" },
    ],
    outcome: { description: "Reduced repeat no-shows by adapting booking approach", valueType: ValueType.APPOINTMENTS_BOOKED },
  },

  slot_clustering: {
    title: "Fix the specific slots that keep emptying",
    reason: "Lost appointments concentrate in particular times or treatment types",
    owner: WorkflowOwner.DENTIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Review cancellation and no-show patterns by time of day" },
      { order: 2, instruction: "Identify which treatment types or time slots are worst" },
      { order: 3, instruction: "Decide whether to shorten lead time, require deposit, or change slot timing" },
      { order: 4, instruction: "Update booking rules for the affected slots" },
    ],
    outcome: { description: "Reduced attrition in the worst-performing slots", valueType: ValueType.APPOINTMENTS_BOOKED },
  },

  reminder_process: {
    title: "Establish a reminder process for all appointments",
    reason: "Lost appointments are spread across the patient base — reminders are not reaching people",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.SUBSTANTIAL,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "List all appointments for the next 3 days" },
      { order: 2, instruction: "Call or message each patient the day before their visit" },
      { order: 3, instruction: "Track each reminder as sent or undelivered" },
      { order: 4, instruction: "Follow up on undelivered reminders with alternative contact" },
      { order: 5, instruction: "Make this a daily end-of-day routine going forward" },
    ],
    outcome: { description: "Every patient receives a reminder before their visit", valueType: ValueType.APPOINTMENTS_BOOKED },
  },

  // ── Financial ─────────────────────────────────────────────────────────────
  systemic_process: {
    title: "Collect at checkout, every time",
    reason: "The collection gap has persisted across multiple days — it is the routine, not a one-off",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.TODAY,
    tasks: [
      { order: 1, instruction: "Review today's completed treatments that have no payment recorded" },
      { order: 2, instruction: "For each, collect payment or formally record the balance and a payment date" },
      { order: 3, instruction: "Make payment/balance recording a mandatory checkout step from today" },
      { order: 4, instruction: "At end of day, verify every completed patient has a payment entry" },
    ],
    outcome: { description: "Zero treatments leave the clinic without a payment or payment plan", valueType: ValueType.REVENUE_RECOVERED },
  },

  patient_balances: {
    title: "Chase the oldest outstanding balances",
    reason: "Unpaid balances are weighted toward long-outstanding amounts",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.SUBSTANTIAL,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Pull the outstanding balance list sorted by oldest first", hint: "Payments page → Outstanding tab" },
      { order: 2, instruction: "Prioritize the top 10 largest balances" },
      { order: 3, instruction: "Contact each patient to arrange payment or a payment plan" },
      { order: 4, instruction: "Record outcome: paid, plan agreed, unable to reach, declined" },
      { order: 5, instruction: "Schedule follow-up for those who agreed to pay later" },
    ],
    outcome: { description: "Reduced outstanding balance by recovering long-overdue payments", valueType: ValueType.REVENUE_RECOVERED },
  },

  volume: {
    title: "Fill the schedule from recall and treatment lists",
    reason: "Revenue was low because fewer patients came in, not because work went uncollected",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.SUBSTANTIAL,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Check this week's remaining open slots" },
      { order: 2, instruction: "Pull the overdue recall list — patients who are due or past due" },
      { order: 3, instruction: "Pull patients with planned treatment and no next visit" },
      { order: 4, instruction: "Contact patients from both lists, starting with those overdue longest" },
      { order: 5, instruction: "Book into available slots and record outcome" },
    ],
    outcome: { description: "Filled empty schedule from existing patient base", valueType: ValueType.APPOINTMENTS_BOOKED },
  },

  yield: {
    title: "Collect for today's completed treatments",
    reason: "Work was delivered at normal volume but the money did not come in",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.QUICK,
    timeframe: WorkflowTimeframe.TODAY,
    tasks: [
      { order: 1, instruction: "Review today's completed treatments" },
      { order: 2, instruction: "Check which have no payment recorded" },
      { order: 3, instruction: "Collect payment before the patient leaves, or record the balance" },
    ],
    outcome: { description: "Collected revenue for work already delivered today", valueType: ValueType.REVENUE_RECOVERED },
  },

  case_mix: {
    title: "Review treatment presentations for the week",
    reason: "Revenue was lower because only lower-value procedures were done, not because work went unpaid",
    owner: WorkflowOwner.DENTIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Review this week's completed treatments by type and value" },
      { order: 2, instruction: "Identify patients who received only partial treatment" },
      { order: 3, instruction: "Check whether complete plans were presented for those patients" },
      { order: 4, instruction: "For next consultations, ensure full treatment plans are discussed" },
    ],
    outcome: { description: "Patients are offered complete treatment, not just the immediate fix", valueType: ValueType.REVENUE_RECOVERED },
  },

  // ── Capacity ──────────────────────────────────────────────────────────────
  demand_exceeds_capacity: {
    title: "Add chair time on your busiest days",
    reason: "Demand met the ceiling while patients were still waiting",
    owner: WorkflowOwner.DENTIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Identify which days consistently hit full capacity" },
      { order: 2, instruction: "Decide whether to extend hours, add a session, or protect high-value slots" },
      { order: 3, instruction: "Update availability rules for the affected days", hint: "Settings → Availability" },
      { order: 4, instruction: "Monitor whether the queue still builds on those days" },
    ],
    outcome: { description: "Reduced wait times on peak days by adding capacity where needed", valueType: ValueType.APPOINTMENTS_BOOKED },
  },

  schedule_overbooking: {
    title: "Fix appointment durations that overrun",
    reason: "Appointments are booked shorter than they actually take",
    owner: WorkflowOwner.DENTIST,
    effort: WorkflowEffort.QUICK,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Review which treatment types consistently run over their booked time" },
      { order: 2, instruction: "Increase the default duration for those types" },
      { order: 3, instruction: "Update the average appointment duration in clinic settings if needed", hint: "Settings → Clinic Settings" },
    ],
    outcome: { description: "Appointments fit their booked time, reducing queue buildup", valueType: ValueType.HOURS_SAVED },
  },

  capacity_bound: {
    title: "Relieve the busiest sessions",
    reason: "Patients waited because the chair was full, not because of poor scheduling",
    owner: WorkflowOwner.DENTIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Identify which sessions are consistently at 100%" },
      { order: 2, instruction: "Move routine/flexible appointments to quieter sessions" },
      { order: 3, instruction: "Consider adding a session or extending the busiest days" },
      { order: 4, instruction: "Update availability accordingly" },
    ],
    outcome: { description: "Reduced congestion by balancing load across sessions", valueType: ValueType.HOURS_SAVED },
  },

  flow_bound: {
    title: "Spread bookings so patients are not stacked",
    reason: "Patients waited while chairs sat empty — arrivals are bunched together",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Review this week's queue buildup patterns — which hours had waits?" },
      { order: 2, instruction: "Check if multiple patients are being booked at the same time" },
      { order: 3, instruction: "Stagger future bookings by the actual appointment duration" },
      { order: 4, instruction: "Set clear arrival windows when booking" },
    ],
    outcome: { description: "Smoother patient flow with less bunching", valueType: ValueType.HOURS_SAVED },
  },

  service_time_variance: {
    title: "Book the time appointments actually take",
    reason: "Queue builds from durations booked too short, not from patient bunching",
    owner: WorkflowOwner.DENTIST,
    effort: WorkflowEffort.QUICK,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Review which treatments consistently overrun their booked time" },
      { order: 2, instruction: "Increase booked duration for those specific treatment types" },
      { order: 3, instruction: "Update default appointment duration if the average shifted" },
    ],
    outcome: { description: "Appointments fit their actual duration, reducing downstream waits", valueType: ValueType.HOURS_SAVED },
  },

  arrival_punctuality: {
    title: "Stagger patient arrivals",
    reason: "Patients arrive together rather than spread across the session",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.QUICK,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Review if multiple patients are being given the same arrival time" },
      { order: 2, instruction: "Space bookings by actual treatment duration going forward" },
      { order: 3, instruction: "Tell patients a specific arrival time, not just 'morning' or 'afternoon'" },
    ],
    outcome: { description: "Patients arrive spread across the session, reducing bunching", valueType: ValueType.HOURS_SAVED },
  },

  // ── Retention ─────────────────────────────────────────────────────────────
  acquisition_driven: {
    title: "Rebuild new patient flow",
    reason: "First-time registrations dropped below the usual level",
    owner: WorkflowOwner.DENTIST,
    effort: WorkflowEffort.SUBSTANTIAL,
    timeframe: WorkflowTimeframe.SOON,
    tasks: [
      { order: 1, instruction: "Review new patient registrations over the last 30 days vs prior period" },
      { order: 2, instruction: "Ask recent satisfied patients if they would refer friends or family" },
      { order: 3, instruction: "Check that Google Business listing is current with correct hours and photos" },
      { order: 4, instruction: "Follow up on any enquiries that never became bookings" },
    ],
    outcome: { description: "Restored new patient flow to normal levels", valueType: ValueType.OTHER },
  },

  retention_driven: {
    title: "Bring overdue recall patients back",
    reason: "Returning-patient volume dropped — existing patients are not coming back",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.SUBSTANTIAL,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Pull the overdue recall list", hint: "Patients → filter by last visit > 6 months ago" },
      { order: 2, instruction: "Prioritize patients overdue longest" },
      { order: 3, instruction: "Contact each patient — phone is best for lapsed patients" },
      { order: 4, instruction: "Offer a specific appointment date and time" },
      { order: 5, instruction: "Record outcome: booked, declined, unreachable" },
    ],
    outcome: { description: "Recovered lapsed patients and improved recall rate", valueType: ValueType.RETENTION_IMPROVED },
  },

  recall_execution: {
    title: "Work the overdue recall list this week",
    reason: "Returning visits dropped while acquisition held steady — the recall process stalled",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.SUBSTANTIAL,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Pull the full overdue follow-up and recall list" },
      { order: 2, instruction: "Sort by longest overdue first" },
      { order: 3, instruction: "Set aside 30 minutes daily this week for recall calls" },
      { order: 4, instruction: "Call each patient, offer a specific date" },
      { order: 5, instruction: "Book immediately for those who agree" },
      { order: 6, instruction: "Record outcome: booked, will call back, declined, unreachable" },
    ],
    outcome: { description: "Cleared the overdue recall backlog and restored returning-patient volume", valueType: ValueType.RETENTION_IMPROVED },
  },

  // ── Treatment acceptance ──────────────────────────────────────────────────
  unconverted_demand: {
    title: "Book patients who have planned treatment and no next visit",
    reason: "Planned work and empty chairs exist on the same day — they just have not been connected",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.TODAY,
    tasks: [
      { order: 1, instruction: "Pull the list of patients with planned treatment and no upcoming appointment", hint: "Patients with planned treatments who have no next visit scheduled" },
      { order: 2, instruction: "Check today's and this week's available slots" },
      { order: 3, instruction: "Contact each patient and offer a specific slot" },
      { order: 4, instruction: "Book immediately for those who accept" },
      { order: 5, instruction: "Record outcome for each" },
    ],
    outcome: { description: "Converted planned treatment into booked appointments", valueType: ValueType.APPOINTMENTS_BOOKED },
  },

  insufficient_demand: {
    title: "Fill capacity from recall before opening new slots",
    reason: "Chairs went unused and the treatment pipeline is thin — need more patients, not more time",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.SUBSTANTIAL,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Pull overdue recall patients (last visit > 6 months)" },
      { order: 2, instruction: "Pull reactivation candidates (no recent contact)" },
      { order: 3, instruction: "Contact each, starting with those overdue longest" },
      { order: 4, instruction: "Book into the open slots for this week" },
      { order: 5, instruction: "Only consider adding more open hours once these lists are exhausted" },
    ],
    outcome: { description: "Filled empty capacity from existing patient base before expanding", valueType: ValueType.APPOINTMENTS_BOOKED },
  },

  capacity_not_offered: {
    title: "Publish availability so patients can book",
    reason: "No bookable chair time was published — an empty schedule reflects what was offered, not demand",
    owner: WorkflowOwner.DENTIST,
    effort: WorkflowEffort.QUICK,
    timeframe: WorkflowTimeframe.TODAY,
    tasks: [
      { order: 1, instruction: "Check availability rules for today and this week", hint: "Settings → Availability" },
      { order: 2, instruction: "Publish open hours for any day that has no availability set" },
      { order: 3, instruction: "Verify slots appear correctly for patient booking" },
    ],
    outcome: { description: "Patients can see and book available slots", valueType: ValueType.APPOINTMENTS_BOOKED },
  },

  booking_follow_through: {
    title: "Book the next visit before patients leave",
    reason: "Chairs were free, yet patients with planned treatment left without a date",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.TODAY,
    tasks: [
      { order: 1, instruction: "Pull the list of patients with planned treatment and no next appointment" },
      { order: 2, instruction: "Contact those who visited in the last 2 weeks first" },
      { order: 3, instruction: "Offer a specific date and time for their next treatment" },
      { order: 4, instruction: "Make booking-next-visit a standard checkout step from today" },
    ],
    outcome: { description: "No patient leaves with planned treatment and no next appointment", valueType: ValueType.APPOINTMENTS_BOOKED },
  },

  patient_deferral: {
    title: "Follow up plans that have been waiting over 2 weeks",
    reason: "Planned treatments are sitting well beyond a normal booking gap — patients deferred",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Pull planned treatments older than 2 weeks with no upcoming appointment" },
      { order: 2, instruction: "Call each patient to re-present the plan and understand their hesitation" },
      { order: 3, instruction: "Address concerns (timing, fear, cost) and offer next steps" },
      { order: 4, instruction: "Book those who are ready; record reason for those who decline" },
    ],
    outcome: { description: "Converted deferred plans into booked appointments", valueType: ValueType.APPOINTMENTS_BOOKED },
  },

  cost_barrier: {
    title: "Offer payment options for high-value plans",
    reason: "The unbooked backlog concentrates in expensive treatments — cost is the barrier",
    owner: WorkflowOwner.DENTIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Identify the high-value planned treatments that have been unbooked longest" },
      { order: 2, instruction: "Prepare a staged payment or phased treatment option for each" },
      { order: 3, instruction: "Contact the patients and present the payment option" },
      { order: 4, instruction: "Book those who accept; record reason for those who decline" },
    ],
    outcome: { description: "Removed cost barrier from high-value treatment plans", valueType: ValueType.REVENUE_RECOVERED },
  },

  // ── Operational ───────────────────────────────────────────────────────────
  no_available_capacity: {
    title: "Open slots for the treatment that is waiting",
    reason: "Patients have planned treatment but the book was full when they were ready",
    owner: WorkflowOwner.DENTIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Review this week's schedule for any flexibility or gaps" },
      { order: 2, instruction: "Consider extending one or two days by 30–60 minutes" },
      { order: 3, instruction: "Update availability rules to reflect additional slots", hint: "Settings → Availability" },
      { order: 4, instruction: "Book waiting patients into the newly opened time" },
    ],
    outcome: { description: "Placed waiting treatment into newly opened chair time", valueType: ValueType.APPOINTMENTS_BOOKED },
  },
};

/**
 * Investigative workflow templates keyed by constraint category.
 *
 * These are lighter-touch plans: the engine could not settle a cause, so the
 * workflow's job is to obtain the measurement that would, not to act on a guess.
 */
const INVESTIGATIVE_TEMPLATES: Readonly<Record<ConstraintCategory, WorkflowTemplate>> = {
  [ConstraintCategory.CAPACITY]: {
    title: "Investigate why chair time is going unused",
    reason: "The cause of idle capacity could not be determined from available data",
    owner: WorkflowOwner.DENTIST,
    effort: WorkflowEffort.QUICK,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Review this week's schedule: were hours published and visible?" },
      { order: 2, instruction: "Check if patients were trying to book but no slots showed" },
      { order: 3, instruction: "Note whether the idle time was a specific day or spread across the week" },
      { order: 4, instruction: "Record your findings so the next analysis can separate the cause" },
    ],
    outcome: { description: "Identified why capacity is being underused" },
  },

  [ConstraintCategory.SCHEDULING]: {
    title: "Investigate why appointments are being lost",
    reason: "Appointments are disappearing from the schedule but the cause pattern is unclear",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Pull cancellations and no-shows from the last 7 days" },
      { order: 2, instruction: "Check if any pattern exists: time of day, treatment type, day of week" },
      { order: 3, instruction: "Ask patients who cancelled recently why they did not come" },
      { order: 4, instruction: "Note whether reminders were sent and received" },
      { order: 5, instruction: "Record findings for the next analysis cycle" },
    ],
    outcome: { description: "Identified the pattern behind lost appointments" },
  },

  [ConstraintCategory.REVENUE_LEAKAGE]: {
    title: "Investigate why money is not arriving",
    reason: "Work is being delivered but revenue is lagging — the cause is not yet clear",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Review the outstanding balance list — is it growing or stable?" },
      { order: 2, instruction: "Check if specific patients dominate the balance" },
      { order: 3, instruction: "Verify that every completed treatment has a charge recorded" },
      { order: 4, instruction: "Note whether the gap is billing lag or genuine non-payment" },
    ],
    outcome: { description: "Identified the cause of the collection gap" },
  },

  [ConstraintCategory.TREATMENT_ACCEPTANCE]: {
    title: "Investigate why planned treatment is not being booked",
    reason: "Patients with treatment plans are not returning, but the barrier is unclear",
    owner: WorkflowOwner.DENTIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Review the planned-but-unbooked treatment list" },
      { order: 2, instruction: "Check how old each plan is — fresh vs stale" },
      { order: 3, instruction: "Contact 3–5 patients to understand their hesitation" },
      { order: 4, instruction: "Note whether the barrier is cost, timing, fear, or something else" },
    ],
    outcome: { description: "Identified the primary barrier to treatment acceptance" },
  },

  [ConstraintCategory.RETENTION]: {
    title: "Investigate why patients are not coming back",
    reason: "Returning-patient volume dropped but the cause is not yet established",
    owner: WorkflowOwner.RECEPTIONIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.THIS_WEEK,
    tasks: [
      { order: 1, instruction: "Pull the list of patients who should have returned but have not" },
      { order: 2, instruction: "Check if recall reminders were sent to these patients" },
      { order: 3, instruction: "Call 5–10 overdue patients to understand why they have not returned" },
      { order: 4, instruction: "Note the common reasons and record them" },
    ],
    outcome: { description: "Identified why patients are not returning", valueType: ValueType.RETENTION_IMPROVED },
  },

  [ConstraintCategory.ACQUISITION]: {
    title: "Investigate why fewer new patients are arriving",
    reason: "New registrations dropped but nothing in the clinic data explains why",
    owner: WorkflowOwner.DENTIST,
    effort: WorkflowEffort.MODERATE,
    timeframe: WorkflowTimeframe.SOON,
    tasks: [
      { order: 1, instruction: "Check if anything changed in how patients find you (listing, referrals, signage)" },
      { order: 2, instruction: "Ask recent new patients how they heard about the clinic" },
      { order: 3, instruction: "Review if any referral sources dried up" },
      { order: 4, instruction: "Note findings for the next analysis cycle" },
    ],
    outcome: { description: "Identified the cause of declining new-patient flow" },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Template keys
//
// The stable, clinic-independent identity of a workflow, and the join key the
// Action Engine maps its plans on. Exported so `action-coverage.spec.ts` can
// enumerate the real set rather than restating it — a restated list is exactly
// how the two engines would drift apart.
// ─────────────────────────────────────────────────────────────────────────────

/** The key an investigative workflow for `category` is filed under. */
export function investigativeKey(category: ConstraintCategory): string {
  return `investigate.${category}`;
}

/** Every workflow template key the engine can produce. */
export const WORKFLOW_TEMPLATE_KEYS: readonly string[] = [
  ...Object.keys(CORRECTIVE_TEMPLATES),
  ...Object.values(ConstraintCategory).map(investigativeKey),
];

// ─────────────────────────────────────────────────────────────────────────────
// Priority mapping
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_RANK: Readonly<Record<string, number>> = {
  [Priority.CRITICAL]: 3,
  [Priority.HIGH]: 2,
  [Priority.MEDIUM]: 1,
  [Priority.LOW]: 0,
};

const TIMEFRAME_RANK: Readonly<Record<WorkflowTimeframe, number>> = {
  [WorkflowTimeframe.TODAY]: 3,
  [WorkflowTimeframe.THIS_WEEK]: 2,
  [WorkflowTimeframe.SOON]: 1,
  [WorkflowTimeframe.ONGOING]: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the hypothesis slug from a strategy id like `strategy.capacity.unconverted_demand:clinicId:date` */
function slugFromStrategyId(strategyId: string): string | null {
  // Format: strategy.<category>.<slug>:<clinicId>:<date>
  const afterFirstDot = strategyId.indexOf(".");
  if (afterFirstDot === -1) return null;
  const afterSecondDot = strategyId.indexOf(".", afterFirstDot + 1);
  if (afterSecondDot === -1) return null;
  const colonPos = strategyId.indexOf(":", afterSecondDot + 1);
  if (colonPos === -1) return null;
  return strategyId.slice(afterSecondDot + 1, colonPos);
}

/** Extract constraint category from a constraint id like `constraint.capacity:clinicId:date` */
function categoryFromConstraintId(constraintId: string): ConstraintCategory | null {
  const afterDot = constraintId.indexOf(".");
  if (afterDot === -1) return null;
  const colonPos = constraintId.indexOf(":", afterDot + 1);
  if (colonPos === -1) return null;
  const cat = constraintId.slice(afterDot + 1, colonPos);
  return Object.values(ConstraintCategory).includes(cat as ConstraintCategory)
    ? (cat as ConstraintCategory)
    : null;
}

/**
 * Generate workflows from strategies.
 *
 * Deterministic: same inputs → same outputs. No AI, no clock (uses `now`
 * parameter), no database access.
 *
 * @param strategies  The strategies to transform into execution plans.
 * @param constraints The constraints behind those strategies (for category lookup).
 * @param clinicId    Scoping identifier.
 * @param date        The business date these workflows are for.
 * @param now         ISO-8601 creation timestamp (injected for determinism).
 */
export function generateWorkflows(
  strategies: readonly ReasonedStrategy[],
  constraints: readonly Constraint[],
  clinicId: string,
  date: string,
  now: string,
): WorkflowResult {
  const constraintById = new Map(constraints.map((c) => [c.id, c]));
  const workflows: Workflow[] = [];

  for (const strategy of strategies) {
    const constraint = constraintById.get(strategy.constraintId);
    const category = constraint?.category ?? categoryFromConstraintId(strategy.constraintId);

    if (strategy.kind === StrategyKind.CORRECTIVE) {
      const slug = slugFromStrategyId(strategy.id);
      if (slug === null) continue;

      const template = CORRECTIVE_TEMPLATES[slug];
      if (template === undefined) continue;

      workflows.push(buildWorkflow(template, slug, strategy, category, clinicId, date, now));
    } else {
      // Investigative
      if (category === null) continue;
      const template = INVESTIGATIVE_TEMPLATES[category];
      if (template === undefined) continue;

      workflows.push(
        buildWorkflow(template, investigativeKey(category), strategy, category, clinicId, date, now),
      );
    }
  }

  // Sort: priority desc → timeframe urgency desc → id stable
  workflows.sort((a, b) => {
    const byPriority = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
    if (byPriority !== 0) return byPriority;
    const byTimeframe = (TIMEFRAME_RANK[b.timeframe] ?? 0) - (TIMEFRAME_RANK[a.timeframe] ?? 0);
    if (byTimeframe !== 0) return byTimeframe;
    return a.id.localeCompare(b.id);
  });

  return { workflows };
}

function buildWorkflow(
  template: WorkflowTemplate,
  templateKey: string,
  strategy: ReasonedStrategy,
  category: ConstraintCategory | null,
  clinicId: string,
  date: string,
  now: string,
): Workflow {
  const slug = slugFromStrategyId(strategy.id) ?? strategy.kind;
  const catPart = category ?? "unknown";

  return {
    id: `workflow.${catPart}.${slug}:${clinicId}:${date}`,
    templateKey,
    title: template.title,
    reason: template.reason,
    owner: template.owner,
    priority: strategy.priority,
    effort: template.effort,
    timeframe: template.timeframe,
    tasks: template.tasks.map((t, i) => ({
      ...t,
      id: `workflow.${catPart}.${slug}.task.${i + 1}:${clinicId}:${date}`,
    })),
    expectedOutcome: template.outcome,
    strategyId: strategy.id,
    constraintId: strategy.constraintId,
    involvedEntities: [],
    createdAt: now,
  };
}
