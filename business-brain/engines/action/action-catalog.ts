/**
 * Business Brain — Action Engine: the capability catalog
 *
 * Every distinct thing DentGrow can prepare, defined exactly once.
 *
 * ## Why a catalog and not per-workflow action lists
 *
 * "Open the patient record" belongs to recall, to balance chasing, to repeat
 * non-attendance and to deferred treatment plans. Written inline in each
 * workflow it would exist four times, and the fourth copy would be the one that
 * still says `?tab=followups` after the tab was renamed. Defined once here, it is
 * referenced four times and corrected once.
 *
 * The catalog is also where the product decisions live that a channel adapter
 * must not make for itself: which screen an action means, which parameters that
 * screen genuinely accepts, how much of the work DentGrow can honestly claim to
 * have done, and — for drafts — which channels the message would be appropriate
 * on. A future WhatsApp sender reads `supportedChannels` and the draft body; it
 * decides nothing.
 *
 * ## Filters must be real
 *
 * `filters` returns query parameters the destination route actually reads. An
 * invented parameter produces a link that opens an unfiltered screen while the
 * card claims it is filtered, which is worse than offering no link at all.
 * `action-targets.spec.ts` checks every key emitted here against the parameters
 * the routes accept.
 *
 * ## Honesty about preparation
 *
 * `readiness` is not decoration. `PREPARED` means the screen opens ready to work.
 * `PARTIALLY_PREPARED` means one named step — usually a sort, or narrowing a list
 * DentGrow cannot narrow — is still manual. `MANUAL` means DentGrow can only get
 * you to the right screen. Overstating any of these is how a dashboard loses
 * trust on the second click.
 */

import {
  ActionCategory,
  ActionChannel,
  ActionDataRequirement,
  ActionDraftKind,
  ActionEffort,
  ActionKind,
  ActionReadiness,
  DentGrowArea,
  ValueType,
  WorkflowOwner,
  type ActionDraft,
} from "../../domain";
import type { ActionDateWindows } from "./action-dates";

/** A draft template. `body` may contain `{{placeholder}}` markers. */
interface DraftTemplate {
  readonly kind: ActionDraftKind;
  readonly subject?: string;
  readonly body: string;
}

/** One reusable thing DentGrow can prepare. */
export interface ActionCapability {
  readonly id: string;
  readonly kind: ActionKind;
  readonly category: ActionCategory;
  /** Default title. A plan may override it where the wording should differ. */
  readonly title: string;
  readonly description: string;
  readonly area: DentGrowArea;
  /** Query parameters for the destination. Derived from the run's date windows. */
  readonly filters?: (w: ActionDateWindows) => Readonly<Record<string, string>>;
  /** An ordering the destination cannot apply itself. */
  readonly sortHint?: string;
  readonly effort: ActionEffort;
  readonly readiness: ActionReadiness;
  readonly requires: readonly ActionDataRequirement[];
  /** Channels this action could be delivered over in a later phase. */
  readonly supportedChannels: readonly ActionChannel[];
  /** What taking it contributes. Never a forecast. */
  readonly impact: string;
  readonly valueType?: ValueType;
  /**
   * Set only when the capability is role-bound regardless of who owns the
   * workflow — changing clinic-wide rules is the dentist's, not the front desk's.
   * Otherwise the action inherits the workflow's owner.
   */
  readonly owner?: WorkflowOwner;
  readonly draft?: DraftTemplate;
}

/** In-app only. Every capability that is not a draft carries exactly this. */
const IN_APP_ONLY: readonly ActionChannel[] = [ActionChannel.IN_APP];

/**
 * A message a clinic would plausibly send over WhatsApp, SMS or email.
 *
 * Voice is deliberately absent everywhere: a text template is not a call script,
 * and listing VOICE would invite a future adapter to read one out.
 */
const MESSAGE_CHANNELS: readonly ActionChannel[] = [
  ActionChannel.IN_APP,
  ActionChannel.WHATSAPP,
  ActionChannel.SMS,
  ActionChannel.EMAIL,
];

/**
 * Capability ids, as constants.
 *
 * Used by the plan table so a typo is a compile error rather than a plan that
 * silently produces one fewer action.
 */
export const Capability = {
  // Scheduling
  OPEN_CANCELLED_APPOINTMENTS: "open_cancelled_appointments",
  OPEN_NO_SHOWS: "open_no_shows",
  OPEN_NON_ATTENDANCE_HISTORY: "open_non_attendance_history",
  OPEN_TOMORROWS_SCHEDULE: "open_tomorrows_schedule",
  OPEN_NEXT_THREE_DAYS: "open_next_three_days",
  OPEN_WEEK_SCHEDULE: "open_week_schedule",
  OPEN_APPOINTMENT_SCHEDULER: "open_appointment_scheduler",
  OPEN_QUEUE_BOARD: "open_queue_board",
  // Clinical
  OPEN_PLANNED_TREATMENTS: "open_planned_treatments",
  OPEN_IN_PROGRESS_TREATMENTS: "open_in_progress_treatments",
  OPEN_TODAYS_COMPLETED_TREATMENTS: "open_todays_completed_treatments",
  OPEN_WEEKS_COMPLETED_TREATMENTS: "open_weeks_completed_treatments",
  // Patient review
  OPEN_OVERDUE_RECALL_PATIENTS: "open_overdue_recall_patients",
  OPEN_RECENT_PATIENTS: "open_recent_patients",
  OPEN_NEW_REGISTRATIONS: "open_new_registrations",
  OPEN_PATIENT_RECORD: "open_patient_record",
  OPEN_OVERDUE_FOLLOW_UPS: "open_overdue_follow_ups",
  SCHEDULE_FOLLOW_UP: "schedule_follow_up",
  // Financial
  OPEN_OUTSTANDING_BALANCES: "open_outstanding_balances",
  OPEN_TODAYS_PAYMENTS: "open_todays_payments",
  OPEN_PATIENT_LEDGER: "open_patient_ledger",
  RECORD_PAYMENT: "record_payment",
  // Communication
  PREPARE_CALL_LIST: "prepare_call_list",
  DRAFT_RECALL_INVITATION: "draft_recall_invitation",
  DRAFT_APPOINTMENT_CONFIRMATION: "draft_appointment_confirmation",
  DRAFT_PAYMENT_REMINDER: "draft_payment_reminder",
  DRAFT_STANDBY_SLOT_OFFER: "draft_standby_slot_offer",
  DRAFT_TREATMENT_PLAN_FOLLOW_UP: "draft_treatment_plan_follow_up",
  // Configuration
  OPEN_AVAILABILITY_SETTINGS: "open_availability_settings",
  OPEN_CLINIC_SETTINGS: "open_clinic_settings",
  // Reporting
  OPEN_MONTH_PERFORMANCE_REPORT: "open_month_performance_report",
  OPEN_NEW_PATIENT_REPORT: "open_new_patient_report",
} as const;

export type CapabilityId = (typeof Capability)[keyof typeof Capability];

// ─────────────────────────────────────────────────────────────────────────────
// The catalog
// ─────────────────────────────────────────────────────────────────────────────

const CATALOG_ENTRIES: readonly ActionCapability[] = [
  // ── Scheduling ────────────────────────────────────────────────────────────
  {
    id: Capability.OPEN_CANCELLED_APPOINTMENTS,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.SCHEDULING,
    title: "Open cancellations from the last 7 days",
    description:
      "Opens the appointment list filtered to cancelled appointments over the last seven days.",
    area: DentGrowArea.APPOINTMENTS,
    filters: (w) => ({ status: "cancelled", dateFrom: w.last7Start, dateTo: w.today }),
    effort: ActionEffort.ONE_CLICK,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.APPOINTMENT_RECORDS],
    supportedChannels: IN_APP_ONLY,
    impact: "Shows every slot lost to cancellation while it is still refillable",
    valueType: ValueType.APPOINTMENTS_BOOKED,
  },
  {
    id: Capability.OPEN_NO_SHOWS,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.SCHEDULING,
    title: "Open no-shows from the last 7 days",
    description:
      "Opens the appointment list filtered to no-shows over the last seven days.",
    area: DentGrowArea.APPOINTMENTS,
    filters: (w) => ({ status: "no_show", dateFrom: w.last7Start, dateTo: w.today }),
    effort: ActionEffort.ONE_CLICK,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.APPOINTMENT_RECORDS],
    supportedChannels: IN_APP_ONLY,
    impact: "Shows chair time lost with no warning",
    valueType: ValueType.APPOINTMENTS_BOOKED,
  },
  {
    id: Capability.OPEN_NON_ATTENDANCE_HISTORY,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.PATIENT_REVIEW,
    title: "Open the last 90 days of no-shows",
    description:
      "Opens 90 days of no-shows so repeat non-attenders can be picked out. DentGrow does not filter patients by missed-appointment count, so grouping by patient is done on the list.",
    area: DentGrowArea.APPOINTMENTS,
    filters: (w) => ({ status: "no_show", dateFrom: w.last90Start, dateTo: w.today }),
    sortHint: "Group by patient to find names that appear more than once",
    effort: ActionEffort.MINUTES,
    readiness: ActionReadiness.PARTIALLY_PREPARED,
    requires: [ActionDataRequirement.APPOINTMENT_STATUS_HISTORY],
    supportedChannels: IN_APP_ONLY,
    impact: "Identifies the patients non-attendance concentrates in",
  },
  {
    id: Capability.OPEN_TOMORROWS_SCHEDULE,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.SCHEDULING,
    title: "Open tomorrow's appointment list",
    description:
      "Opens tomorrow's scheduled appointments, ready to work down for confirmations.",
    area: DentGrowArea.APPOINTMENTS,
    filters: (w) => ({ status: "scheduled", dateFrom: w.tomorrow, dateTo: w.tomorrow }),
    effort: ActionEffort.ONE_CLICK,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.APPOINTMENT_RECORDS],
    supportedChannels: IN_APP_ONLY,
    impact: "Every patient due tomorrow, in one list",
    valueType: ValueType.APPOINTMENTS_BOOKED,
  },
  {
    id: Capability.OPEN_NEXT_THREE_DAYS,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.SCHEDULING,
    title: "Open the next three days of appointments",
    description:
      "Opens scheduled appointments for today and the next two days — the reminder horizon.",
    area: DentGrowArea.APPOINTMENTS,
    filters: (w) => ({ status: "scheduled", dateFrom: w.today, dateTo: w.threeDayEnd }),
    effort: ActionEffort.ONE_CLICK,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.APPOINTMENT_RECORDS],
    supportedChannels: IN_APP_ONLY,
    impact: "One list covering everyone who needs a reminder",
    valueType: ValueType.APPOINTMENTS_BOOKED,
  },
  {
    id: Capability.OPEN_WEEK_SCHEDULE,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.SCHEDULING,
    title: "Open this week's schedule",
    description: "Opens every appointment from Monday to Sunday of the current week.",
    area: DentGrowArea.APPOINTMENTS,
    filters: (w) => ({ dateFrom: w.weekStart, dateTo: w.weekEnd }),
    effort: ActionEffort.MINUTES,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.APPOINTMENT_RECORDS],
    supportedChannels: IN_APP_ONLY,
    impact: "Shows how the week is loaded and where the gaps sit",
  },
  {
    id: Capability.OPEN_APPOINTMENT_SCHEDULER,
    kind: ActionKind.OPEN_FORM,
    category: ActionCategory.SCHEDULING,
    title: "Open the booking form",
    description:
      "Opens the booking form, which shows the open slots for whichever day is picked.",
    area: DentGrowArea.APPOINTMENT_SCHEDULER,
    effort: ActionEffort.MINUTES,
    readiness: ActionReadiness.PARTIALLY_PREPARED,
    requires: [ActionDataRequirement.AVAILABILITY_RULES],
    supportedChannels: [ActionChannel.IN_APP, ActionChannel.CALENDAR],
    impact: "Turns a conversation into a booked slot without leaving the page",
    valueType: ValueType.APPOINTMENTS_BOOKED,
  },
  {
    id: Capability.OPEN_QUEUE_BOARD,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.SCHEDULING,
    title: "Open the waiting-room queue",
    description:
      "Opens the live queue, showing who is waiting and how long they have been there.",
    area: DentGrowArea.QUEUE,
    effort: ActionEffort.ONE_CLICK,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.QUEUE_RECORDS],
    supportedChannels: IN_APP_ONLY,
    impact: "Shows where waits are building right now",
    valueType: ValueType.HOURS_SAVED,
  },

  // ── Clinical ──────────────────────────────────────────────────────────────
  {
    id: Capability.OPEN_PLANNED_TREATMENTS,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.CLINICAL,
    title: "Open planned treatments",
    description:
      "Opens treatments still at planned status. Whether the patient has a next visit booked is checked on the patient record.",
    area: DentGrowArea.TREATMENTS,
    filters: () => ({ status: "planned" }),
    sortHint: "Oldest plans first — those are the ones that have stalled",
    effort: ActionEffort.MINUTES,
    readiness: ActionReadiness.PARTIALLY_PREPARED,
    requires: [ActionDataRequirement.TREATMENT_RECORDS],
    supportedChannels: IN_APP_ONLY,
    impact: "Shows the work already agreed clinically but not yet delivered",
    valueType: ValueType.APPOINTMENTS_BOOKED,
  },
  {
    id: Capability.OPEN_IN_PROGRESS_TREATMENTS,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.CLINICAL,
    title: "Open treatments in progress",
    description: "Opens treatments that have been started but not completed.",
    area: DentGrowArea.TREATMENTS,
    filters: () => ({ status: "in_progress" }),
    effort: ActionEffort.MINUTES,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.TREATMENT_RECORDS],
    supportedChannels: IN_APP_ONLY,
    impact: "Shows part-finished work that needs a next appointment",
  },
  {
    id: Capability.OPEN_TODAYS_COMPLETED_TREATMENTS,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.CLINICAL,
    title: "Open today's completed treatments",
    description: "Opens every treatment completed today.",
    area: DentGrowArea.TREATMENTS,
    filters: (w) => ({ status: "completed", dateFrom: w.today, dateTo: w.today }),
    effort: ActionEffort.ONE_CLICK,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.TREATMENT_RECORDS],
    supportedChannels: IN_APP_ONLY,
    impact: "The work delivered today, to check against what was collected",
    valueType: ValueType.REVENUE_RECOVERED,
  },
  {
    id: Capability.OPEN_WEEKS_COMPLETED_TREATMENTS,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.CLINICAL,
    title: "Open this week's completed treatments",
    description:
      "Opens treatments completed this week, so type and value can be reviewed together.",
    area: DentGrowArea.TREATMENTS,
    filters: (w) => ({ status: "completed", dateFrom: w.weekStart, dateTo: w.weekEnd }),
    effort: ActionEffort.MINUTES,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.TREATMENT_RECORDS],
    supportedChannels: IN_APP_ONLY,
    impact: "Shows what kind of work the week actually consisted of",
  },

  // ── Patient review and follow-ups ─────────────────────────────────────────
  {
    id: Capability.OPEN_OVERDUE_RECALL_PATIENTS,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.PATIENT_REVIEW,
    title: "Open patients with no visit in six months",
    description:
      "Opens the patient list filtered to inactive patients — nobody seen in the last six months.",
    area: DentGrowArea.PATIENTS,
    filters: () => ({ filter: "inactive" }),
    sortHint: "Longest overdue first",
    effort: ActionEffort.SESSION,
    readiness: ActionReadiness.PARTIALLY_PREPARED,
    requires: [
      ActionDataRequirement.PATIENT_VISIT_HISTORY,
      ActionDataRequirement.PATIENT_CONTACT,
    ],
    supportedChannels: IN_APP_ONLY,
    impact: "The recall list, without building it by hand",
    valueType: ValueType.RETENTION_IMPROVED,
  },
  {
    id: Capability.OPEN_RECENT_PATIENTS,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.PATIENT_REVIEW,
    title: "Open recently seen patients",
    description:
      "Opens patients seen in the last six months — the people best placed to refer someone.",
    area: DentGrowArea.PATIENTS,
    filters: () => ({ filter: "active" }),
    effort: ActionEffort.MINUTES,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.PATIENT_VISIT_HISTORY],
    supportedChannels: IN_APP_ONLY,
    impact: "Shows who is currently engaged with the clinic",
  },
  {
    id: Capability.OPEN_NEW_REGISTRATIONS,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.PATIENT_REVIEW,
    title: "Open today's new registrations",
    description: "Opens patients registered today.",
    area: DentGrowArea.PATIENTS,
    filters: () => ({ filter: "new" }),
    effort: ActionEffort.ONE_CLICK,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.PATIENT_VISIT_HISTORY],
    supportedChannels: IN_APP_ONLY,
    impact: "Shows whether new patients arrived today at all",
  },
  {
    id: Capability.OPEN_PATIENT_RECORD,
    kind: ActionKind.OPEN_RECORD,
    category: ActionCategory.PATIENT_REVIEW,
    title: "Open the patient record",
    description:
      "Opens one patient's full record. DentGrow cannot pick the patient for you here, so this opens the directory to search from.",
    area: DentGrowArea.PATIENT_RECORD,
    effort: ActionEffort.MINUTES,
    readiness: ActionReadiness.MANUAL,
    requires: [ActionDataRequirement.PATIENT_SELECTION],
    supportedChannels: IN_APP_ONLY,
    impact: "Puts history, treatments and payments for one patient on one screen",
  },
  {
    id: Capability.OPEN_OVERDUE_FOLLOW_UPS,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.PATIENT_REVIEW,
    title: "Open overdue follow-ups",
    description:
      "Opens follow-ups still pending with a due date of today or earlier.",
    area: DentGrowArea.FOLLOW_UPS,
    filters: (w) => ({ status: "pending", dateTo: w.today }),
    sortHint: "Longest overdue first",
    effort: ActionEffort.SESSION,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.FOLLOW_UP_RECORDS],
    supportedChannels: IN_APP_ONLY,
    impact: "The follow-up backlog, already narrowed to what is late",
    valueType: ValueType.RETENTION_IMPROVED,
  },
  {
    id: Capability.SCHEDULE_FOLLOW_UP,
    kind: ActionKind.OPEN_FORM,
    category: ActionCategory.PATIENT_REVIEW,
    title: "Create a follow-up",
    description:
      "Opens a blank follow-up so a promise made on a call does not rely on memory.",
    area: DentGrowArea.FOLLOW_UP_FORM,
    effort: ActionEffort.ONE_CLICK,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.FOLLOW_UP_RECORDS],
    supportedChannels: [ActionChannel.IN_APP, ActionChannel.CALENDAR],
    impact: "Nothing agreed on a call gets forgotten",
  },

  // ── Financial ─────────────────────────────────────────────────────────────
  {
    id: Capability.OPEN_OUTSTANDING_BALANCES,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.FINANCIAL,
    title: "Open outstanding balances",
    description:
      "Opens the payments page, where the outstanding balances panel lists every unpaid amount. The panel has no sort control, so ordering is done by eye.",
    area: DentGrowArea.PAYMENTS,
    sortHint: "Oldest and largest balances first",
    effort: ActionEffort.SESSION,
    readiness: ActionReadiness.PARTIALLY_PREPARED,
    requires: [ActionDataRequirement.OUTSTANDING_BALANCES],
    supportedChannels: IN_APP_ONLY,
    impact: "Every unpaid amount in one place",
    valueType: ValueType.REVENUE_RECOVERED,
  },
  {
    id: Capability.OPEN_TODAYS_PAYMENTS,
    kind: ActionKind.OPEN_LIST,
    category: ActionCategory.FINANCIAL,
    title: "Open today's payments",
    description:
      "Opens payments recorded today, to check against the treatments completed today.",
    area: DentGrowArea.PAYMENTS,
    filters: (w) => ({ dateFrom: w.today, dateTo: w.today }),
    effort: ActionEffort.ONE_CLICK,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.PAYMENT_RECORDS],
    supportedChannels: IN_APP_ONLY,
    impact: "Shows what actually came in today",
    valueType: ValueType.REVENUE_RECOVERED,
  },
  {
    id: Capability.OPEN_PATIENT_LEDGER,
    kind: ActionKind.OPEN_RECORD,
    category: ActionCategory.FINANCIAL,
    title: "Open a patient's payment history",
    description:
      "Opens the payments tab of a patient record. DentGrow cannot pick the patient here, so this opens the directory to search from.",
    area: DentGrowArea.PATIENT_RECORD,
    filters: () => ({ tab: "payments" }),
    effort: ActionEffort.MINUTES,
    readiness: ActionReadiness.MANUAL,
    requires: [
      ActionDataRequirement.PATIENT_SELECTION,
      ActionDataRequirement.PAYMENT_RECORDS,
    ],
    supportedChannels: IN_APP_ONLY,
    impact: "The full payment picture before a money conversation starts",
  },
  {
    id: Capability.RECORD_PAYMENT,
    kind: ActionKind.OPEN_FORM,
    category: ActionCategory.FINANCIAL,
    title: "Record a payment",
    description: "Opens a blank payment entry.",
    area: DentGrowArea.PAYMENT_FORM,
    effort: ActionEffort.ONE_CLICK,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.PAYMENT_RECORDS],
    supportedChannels: IN_APP_ONLY,
    impact: "Money collected gets recorded before the patient leaves",
    valueType: ValueType.REVENUE_RECOVERED,
  },

  // ── Communication ─────────────────────────────────────────────────────────
  {
    id: Capability.PREPARE_CALL_LIST,
    kind: ActionKind.PREPARE_LIST,
    category: ActionCategory.COMMUNICATION,
    title: "Work the list as a call list",
    description:
      "The filtered list above is the call list. DentGrow does not produce a separate call sheet, so work down the screen and record the outcome — reached, booked, will call back, unreachable — against each patient.",
    area: DentGrowArea.PATIENTS,
    effort: ActionEffort.SESSION,
    readiness: ActionReadiness.MANUAL,
    requires: [ActionDataRequirement.PATIENT_CONTACT],
    supportedChannels: IN_APP_ONLY,
    impact: "Every name on the list is contacted once, and the outcome is written down",
  },
  {
    id: Capability.DRAFT_RECALL_INVITATION,
    kind: ActionKind.PREPARE_DRAFT,
    category: ActionCategory.COMMUNICATION,
    title: "Prepare a follow-up message",
    description:
      "Prepares a check-in message for a patient whose follow-up is due. Draft only — DentGrow does not send it.",
    area: DentGrowArea.PATIENTS,
    effort: ActionEffort.ONE_CLICK,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.PATIENT_CONTACT],
    supportedChannels: MESSAGE_CHANNELS,
    impact: "Removes the rewriting from every follow-up contact",
    valueType: ValueType.RETENTION_IMPROVED,
    draft: {
      kind: ActionDraftKind.RECALL_INVITATION,
      subject: "A quick follow-up from {{clinic_name}}",
      body:
        "Hi {{patient_name}}, this is {{clinic_name}}. You had a follow-up scheduled with us and we wanted to check in. " +
        "If {{suggested_date}} works for you, we can continue your treatment then — reply here or call {{clinic_phone}} to let us know a convenient time.",
    },
  },
  {
    id: Capability.DRAFT_APPOINTMENT_CONFIRMATION,
    kind: ActionKind.PREPARE_DRAFT,
    category: ActionCategory.COMMUNICATION,
    title: "Prepare an appointment confirmation",
    description:
      "Prepares confirmation text asking the patient to confirm or reschedule. Draft only — DentGrow does not send it.",
    area: DentGrowArea.APPOINTMENTS,
    effort: ActionEffort.ONE_CLICK,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.PATIENT_CONTACT],
    supportedChannels: MESSAGE_CHANNELS,
    impact: "Makes confirming every appointment fast enough to actually do daily",
    valueType: ValueType.APPOINTMENTS_BOOKED,
    draft: {
      kind: ActionDraftKind.APPOINTMENT_CONFIRMATION,
      subject: "Your appointment at {{clinic_name}} on {{appointment_date}}",
      body:
        "Hello {{patient_name}}, a reminder of your appointment at {{clinic_name}} on {{appointment_date}} at {{appointment_time}}. " +
        "Please reply to confirm, or call {{clinic_phone}} if you need a different time.",
    },
  },
  {
    id: Capability.DRAFT_PAYMENT_REMINDER,
    kind: ActionKind.PREPARE_DRAFT,
    category: ActionCategory.COMMUNICATION,
    title: "Prepare a payment reminder",
    description:
      "Prepares reminder text for an outstanding balance, offering a payment plan. Draft only — DentGrow does not send it.",
    area: DentGrowArea.PAYMENTS,
    effort: ActionEffort.ONE_CLICK,
    readiness: ActionReadiness.PREPARED,
    requires: [
      ActionDataRequirement.PATIENT_CONTACT,
      ActionDataRequirement.OUTSTANDING_BALANCES,
    ],
    supportedChannels: MESSAGE_CHANNELS,
    impact: "Makes chasing a balance a two-minute job rather than a difficult call",
    valueType: ValueType.REVENUE_RECOVERED,
    draft: {
      kind: ActionDraftKind.PAYMENT_REMINDER,
      subject: "Outstanding balance at {{clinic_name}}",
      body:
        "Hello {{patient_name}}, our records show an outstanding balance of {{amount_outstanding}} for treatment at {{clinic_name}}. " +
        "You can settle it at the clinic or over UPI. If it is easier to pay in instalments, reply here or call {{clinic_phone}} and we will arrange a plan.",
    },
  },
  {
    id: Capability.DRAFT_STANDBY_SLOT_OFFER,
    kind: ActionKind.PREPARE_DRAFT,
    category: ActionCategory.COMMUNICATION,
    title: "Prepare a short-notice slot offer",
    description:
      "Prepares text offering a freed-up slot to someone waiting. Draft only — DentGrow does not send it.",
    area: DentGrowArea.APPOINTMENTS,
    effort: ActionEffort.ONE_CLICK,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.PATIENT_CONTACT],
    supportedChannels: MESSAGE_CHANNELS,
    impact: "A cancelled slot can be offered before it goes cold",
    valueType: ValueType.APPOINTMENTS_BOOKED,
    draft: {
      kind: ActionDraftKind.STANDBY_SLOT_OFFER,
      subject: "A slot has opened up at {{clinic_name}}",
      body:
        "Hello {{patient_name}}, a slot has just opened at {{clinic_name}} on {{slot_date}} at {{slot_time}}. " +
        "It is yours if you would like it — reply here or call {{clinic_phone}} and we will hold it for you.",
    },
  },
  {
    id: Capability.DRAFT_TREATMENT_PLAN_FOLLOW_UP,
    kind: ActionKind.PREPARE_DRAFT,
    category: ActionCategory.COMMUNICATION,
    title: "Prepare a treatment plan follow-up",
    description:
      "Prepares text for a patient whose planned treatment has no date yet. Draft only — DentGrow does not send it.",
    area: DentGrowArea.TREATMENTS,
    effort: ActionEffort.ONE_CLICK,
    readiness: ActionReadiness.PREPARED,
    requires: [
      ActionDataRequirement.PATIENT_CONTACT,
      ActionDataRequirement.TREATMENT_RECORDS,
    ],
    supportedChannels: MESSAGE_CHANNELS,
    impact: "Planned work gets a date instead of quietly ageing",
    valueType: ValueType.APPOINTMENTS_BOOKED,
    draft: {
      kind: ActionDraftKind.TREATMENT_PLAN_FOLLOW_UP,
      subject: "Your treatment plan at {{clinic_name}}",
      body:
        "Hello {{patient_name}}, we still have {{treatment_name}} planned for you at {{clinic_name}} and no date booked yet. " +
        "Would {{suggested_date}} work? If cost or timing is the difficulty, tell us — we can stage the treatment or the payments. Call {{clinic_phone}} any time.",
    },
  },

  // ── Configuration ─────────────────────────────────────────────────────────
  {
    id: Capability.OPEN_AVAILABILITY_SETTINGS,
    kind: ActionKind.REVIEW_SETTING,
    category: ActionCategory.CONFIGURATION,
    title: "Open availability rules",
    description:
      "Opens the availability rules that decide which slots exist and can be booked.",
    area: DentGrowArea.AVAILABILITY_SETTINGS,
    effort: ActionEffort.MINUTES,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.AVAILABILITY_RULES],
    supportedChannels: IN_APP_ONLY,
    impact: "Changes what is bookable, not just what is booked",
    owner: WorkflowOwner.DENTIST,
  },
  {
    id: Capability.OPEN_CLINIC_SETTINGS,
    kind: ActionKind.REVIEW_SETTING,
    category: ActionCategory.CONFIGURATION,
    title: "Open clinic settings",
    description:
      "Opens clinic settings, including the default appointment duration every booking inherits.",
    area: DentGrowArea.CLINIC_SETTINGS,
    effort: ActionEffort.MINUTES,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.CLINIC_SETTINGS],
    supportedChannels: IN_APP_ONLY,
    impact: "Fixes the default that every future booking inherits",
    valueType: ValueType.HOURS_SAVED,
    owner: WorkflowOwner.DENTIST,
  },

  // ── Reporting ─────────────────────────────────────────────────────────────
  {
    id: Capability.OPEN_MONTH_PERFORMANCE_REPORT,
    kind: ActionKind.OPEN_REPORT,
    category: ActionCategory.REPORTING,
    title: "Open this month's analytics",
    description: "Opens analytics for the current month to date.",
    area: DentGrowArea.ANALYTICS,
    filters: (w) => ({ from: w.monthStart, to: w.today }),
    effort: ActionEffort.MINUTES,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.PAYMENT_RECORDS],
    supportedChannels: IN_APP_ONLY,
    impact: "Puts today's finding in the context of the month",
    owner: WorkflowOwner.DENTIST,
  },
  {
    id: Capability.OPEN_NEW_PATIENT_REPORT,
    kind: ActionKind.OPEN_REPORT,
    category: ActionCategory.REPORTING,
    title: "Open the last 30 days of analytics",
    description:
      "Opens analytics over the last 30 days, where new-patient volume can be compared with the period before it.",
    area: DentGrowArea.ANALYTICS,
    filters: (w) => ({ from: w.last30Start, to: w.today }),
    effort: ActionEffort.MINUTES,
    readiness: ActionReadiness.PREPARED,
    requires: [ActionDataRequirement.PATIENT_VISIT_HISTORY],
    supportedChannels: IN_APP_ONLY,
    impact: "Shows whether new-patient flow really changed or just looked like it",
    owner: WorkflowOwner.DENTIST,
  },
];

/** The catalog, indexed. */
export const ACTION_CATALOG: ReadonlyMap<string, ActionCapability> = new Map(
  CATALOG_ENTRIES.map((c) => [c.id, c]),
);

/** Every capability id the catalog defines. */
export const CATALOG_IDS: readonly string[] = CATALOG_ENTRIES.map((c) => c.id);

/** `{{placeholder}}` markers appearing in a draft template, in order, deduplicated. */
export function placeholdersIn(template: DraftTemplate): readonly string[] {
  const found: string[] = [];
  for (const text of [template.subject ?? "", template.body]) {
    for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) {
      if (!found.includes(match[1])) found.push(match[1]);
    }
  }
  return found;
}

/** Build the draft for a capability, if it has one. */
export function buildDraft(capability: ActionCapability): ActionDraft | undefined {
  const template = capability.draft;
  if (template === undefined) return undefined;
  return {
    kind: template.kind,
    subject: template.subject,
    body: template.body,
    placeholders: placeholdersIn(template),
    // Literal, and deliberately so: nothing in this phase can flip it.
    state: "draft",
  };
}
