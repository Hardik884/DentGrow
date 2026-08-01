/**
 * Business Brain — Domain: Action
 *
 * The last stage of the pipeline, and the only one that talks about DentGrow
 * itself rather than about the clinic.
 *
 *   Strategy  WHAT should be done.
 *   Workflow  HOW the clinic should approach it.
 *   Action    HOW DENTGROW helps execute it.
 *
 * An Action makes no business judgement. Every judgement — that something is
 * wrong, why, which bottleneck it belongs to, what to do about it, who should do
 * it and how urgent it is — was made upstream and is inherited verbatim. An
 * Action only answers mechanical questions:
 *
 *   Which screen should open?
 *   What should already be filtered when it opens?
 *   What should already be drafted?
 *   What is left for the human to decide?
 *
 * ## Prepares work, never performs it
 *
 * Nothing here sends, writes, schedules or calls. A draft is text sitting in the
 * UI with `state: "draft"`; a target is a place to go, not a request to make.
 * The invariant is enforced, not just documented: every Action the engine emits
 * carries `delivery.channel === "in_app"` and
 * `delivery.execution === "prepare_only"`, and `action-engine.spec.ts` fails if
 * one ever does not.
 *
 * ## Why the model names an AREA and not a URL
 *
 * Routes are a UI concern and they are role-scoped — the same list lives at
 * `/dentist/payments` and `/receptionist/payments`. If the engine emitted hrefs
 * it would own routing, and a route rename would be a change to a reasoning
 * engine. So an Action names a logical {@link DentGrowArea} plus the filters that
 * belong on it, and the presentation layer resolves that to an href for whoever
 * is looking. That is also what lets one Action serve a dentist and a
 * receptionist without being duplicated.
 */

import type { Priority } from "../types";
import type { RelatedEntity } from "./shared";
import type { ValueType } from "./value";
import type { WorkflowOwner, WorkflowTimeframe } from "./workflow";

// ─────────────────────────────────────────────────────────────────────────────
// What kind of help this is
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The business area an action belongs to.
 *
 * Categories are for grouping and filtering in the UI, and later for routing an
 * action to the team that owns that area. They say nothing about urgency.
 */
export const ActionCategory = {
  /** Reaching a patient: drafts, call lists, reminders. */
  COMMUNICATION: "communication",
  /** The appointment book: slots, bookings, confirmations. */
  SCHEDULING: "scheduling",
  /** Looking at people rather than at process. */
  PATIENT_REVIEW: "patient_review",
  /** Money in, money owed. */
  FINANCIAL: "financial",
  /** Treatment records and clinical work. */
  CLINICAL: "clinical",
  /** Reading the numbers back. */
  REPORTING: "reporting",
  /**
   * Changing a clinic rule — availability, default durations.
   *
   * Deliberately separate from SCHEDULING: opening tomorrow's list and changing
   * the rule that generates every tomorrow are different kinds of work, done by
   * different people, with very different blast radius.
   */
  CONFIGURATION: "configuration",
  /** Getting somewhere. The fallback when nothing more specific fits. */
  NAVIGATION: "navigation",
} as const;

export type ActionCategory = (typeof ActionCategory)[keyof typeof ActionCategory];

/**
 * What DentGrow mechanically does for this action.
 *
 * This is the axis future execution channels attach to: a `PREPARE_DRAFT`
 * action is the one WhatsApp can eventually deliver, an `OPEN_LIST` action never
 * will be.
 */
export const ActionKind = {
  /** Open a screen with a filter already applied. */
  OPEN_LIST: "open_list",
  /** Open one specific record. */
  OPEN_RECORD: "open_record",
  /** Open a form, pre-filled where possible. */
  OPEN_FORM: "open_form",
  /** Open a report for a period. */
  OPEN_REPORT: "open_report",
  /** Assemble a working list the staff member works through. */
  PREPARE_LIST: "prepare_list",
  /** Produce message text. Draft only — nothing is sent. */
  PREPARE_DRAFT: "prepare_draft",
  /** Open a clinic rule for review or change. */
  REVIEW_SETTING: "review_setting",
} as const;

export type ActionKind = (typeof ActionKind)[keyof typeof ActionKind];

/**
 * A logical destination inside DentGrow.
 *
 * Named areas, not routes — see the file header. An area is added here only when
 * a screen for it actually exists; the presentation layer maps each one to a
 * concrete href per role, and a test asserts every area has a mapping.
 */
export const DentGrowArea = {
  APPOINTMENTS: "appointments",
  APPOINTMENT_SCHEDULER: "appointment_scheduler",
  PATIENTS: "patients",
  PATIENT_RECORD: "patient_record",
  TREATMENTS: "treatments",
  PAYMENTS: "payments",
  PAYMENT_FORM: "payment_form",
  FOLLOW_UPS: "follow_ups",
  FOLLOW_UP_FORM: "follow_up_form",
  QUEUE: "queue",
  AVAILABILITY_SETTINGS: "availability_settings",
  CLINIC_SETTINGS: "clinic_settings",
  ANALYTICS: "analytics",
} as const;

export type DentGrowArea = (typeof DentGrowArea)[keyof typeof DentGrowArea];

// ─────────────────────────────────────────────────────────────────────────────
// How much is prepared, and how much is left
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How complete the preparation is.
 *
 * The honest half of the one-click promise. DentGrow can filter a list by any
 * parameter the screen accepts; it cannot filter by something it does not
 * record, and it cannot sort a panel that has no sort control. Saying so on the
 * card is better than opening a screen that does not look the way the action
 * implied it would.
 */
export const ActionReadiness = {
  /** Opens with every filter applied. Nothing left but the work itself. */
  PREPARED: "prepared",
  /** Opens filtered, but a step named in the description is done by hand. */
  PARTIALLY_PREPARED: "partially_prepared",
  /** DentGrow can only open the right screen; the selection is manual. */
  MANUAL: "manual",
} as const;

export type ActionReadiness = (typeof ActionReadiness)[keyof typeof ActionReadiness];

/** Roughly how long the action itself takes, once opened. */
export const ActionEffort = {
  /** A click. Opening a prepared screen, generating a draft. */
  ONE_CLICK: "one_click",
  /** A few minutes of work on one screen. */
  MINUTES: "minutes",
  /** A sitting — a list to work through, a rule to think about. */
  SESSION: "session",
} as const;

export type ActionEffort = (typeof ActionEffort)[keyof typeof ActionEffort];

/**
 * Data the action leans on.
 *
 * Recorded so a future readiness check can be computed rather than asserted: an
 * action needing `PATIENT_CONTACT` is worth less at a clinic that does not
 * record phone numbers, and stating the dependency is what makes that
 * detectable later.
 */
export const ActionDataRequirement = {
  APPOINTMENT_RECORDS: "appointment_records",
  APPOINTMENT_STATUS_HISTORY: "appointment_status_history",
  AVAILABILITY_RULES: "availability_rules",
  CLINIC_SETTINGS: "clinic_settings",
  PATIENT_CONTACT: "patient_contact",
  PATIENT_VISIT_HISTORY: "patient_visit_history",
  PATIENT_SELECTION: "patient_selection",
  PAYMENT_RECORDS: "payment_records",
  OUTSTANDING_BALANCES: "outstanding_balances",
  TREATMENT_RECORDS: "treatment_records",
  FOLLOW_UP_RECORDS: "follow_up_records",
  QUEUE_RECORDS: "queue_records",
} as const;

export type ActionDataRequirement =
  (typeof ActionDataRequirement)[keyof typeof ActionDataRequirement];

// ─────────────────────────────────────────────────────────────────────────────
// Future execution channels
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How an action could reach the person it concerns.
 *
 * Only `IN_APP` is ever emitted today. The rest exist so a channel can be added
 * as a consumer of an unchanged Action — see `supportedChannels` on
 * {@link ActionDelivery}.
 */
export const ActionChannel = {
  /** The DentGrow UI. The only channel this phase uses. */
  IN_APP: "in_app",
  WHATSAPP: "whatsapp",
  SMS: "sms",
  EMAIL: "email",
  PUSH: "push",
  VOICE: "voice",
  CALENDAR: "calendar",
} as const;

export type ActionChannel = (typeof ActionChannel)[keyof typeof ActionChannel];

/**
 * How far DentGrow is allowed to go on the human's behalf.
 *
 * `PREPARE_ONLY` is the only value the Action Engine emits, and a test enforces
 * it. The other two are the shape a later phase grows into, not a capability
 * that exists.
 */
export const ActionExecution = {
  /** DentGrow prepares; a person does it. */
  PREPARE_ONLY: "prepare_only",
  /** Future: one confirmed click causes a side effect. */
  ONE_CLICK: "one_click",
  /** Future: runs without a human in the loop. */
  AUTOMATED: "automated",
} as const;

export type ActionExecution = (typeof ActionExecution)[keyof typeof ActionExecution];

/** Where this action goes now, and where it could go later. */
export interface ActionDelivery {
  /** The channel used for this action. Always `IN_APP` in this phase. */
  readonly channel: ActionChannel;
  /** How far DentGrow goes. Always `PREPARE_ONLY` in this phase. */
  readonly execution: ActionExecution;
  /**
   * Channels that could carry this action once such a channel exists.
   *
   * Declared by the capability, not inferred: whether a recall invitation is
   * appropriate over WhatsApp is a product decision, and it belongs in the
   * catalog next to the draft rather than in the channel adapter.
   */
  readonly supportedChannels: readonly ActionChannel[];
}

// ─────────────────────────────────────────────────────────────────────────────
// The pieces of one action
// ─────────────────────────────────────────────────────────────────────────────

/** Where the action goes, and what is already applied when it gets there. */
export interface ActionTarget {
  /** Logical destination. Resolved to an href by the presentation layer. */
  readonly area: DentGrowArea;
  /**
   * Query parameters the destination screen genuinely accepts.
   *
   * Only real, supported parameters belong here — an invented one would produce
   * a link that silently opens an unfiltered screen, which is worse than no
   * link. `action-targets.spec.ts` checks every key against the parameters the
   * routes actually read.
   */
  readonly filters: Readonly<Record<string, string>>;
  /**
   * An ordering the destination cannot apply itself, stated so the UI can show
   * it as the next manual step rather than implying it is already done.
   */
  readonly sortHint?: string;
  /** The specific record to open, when the action concerns exactly one. */
  readonly entity?: RelatedEntity;
}

/** Message text prepared for a human to read, edit and send themselves. */
export interface ActionDraft {
  /** What sort of message this is, for grouping and for future channel routing. */
  readonly kind: ActionDraftKind;
  /** Subject line, for channels that have one. */
  readonly subject?: string;
  /** The body, with `{{placeholder}}` markers left for the sender to fill. */
  readonly body: string;
  /** Every placeholder appearing in `subject` and `body`. */
  readonly placeholders: readonly string[];
  /**
   * Literal `"draft"`. A type-level statement that nothing on this object was
   * sent: a future send path has to widen this type, which makes the change
   * visible in review instead of implicit.
   */
  readonly state: "draft";
}

export const ActionDraftKind = {
  RECALL_INVITATION: "recall_invitation",
  APPOINTMENT_CONFIRMATION: "appointment_confirmation",
  PAYMENT_REMINDER: "payment_reminder",
  STANDBY_SLOT_OFFER: "standby_slot_offer",
  TREATMENT_PLAN_FOLLOW_UP: "treatment_plan_follow_up",
} as const;

export type ActionDraftKind = (typeof ActionDraftKind)[keyof typeof ActionDraftKind];

/**
 * What completing this action contributes.
 *
 * A statement of contribution, never a forecast. The Value Engine sizes what is
 * at stake in the constraint; nothing in the pipeline predicts how much of it a
 * given click recovers, and this field must not imply otherwise.
 */
export interface ActionImpact {
  readonly statement: string;
  readonly valueType?: ValueType;
}

/**
 * One prepared unit of work.
 */
export interface Action {
  /** `action.<workflowKey>.<capability>:<clinicId>:<date>` */
  readonly id: string;
  /** The reusable catalog entry this came from. */
  readonly capability: string;
  readonly kind: ActionKind;
  readonly category: ActionCategory;
  /** Imperative title: "Open cancellations from the last 7 days". */
  readonly title: string;
  /** What DentGrow prepares, and what the person does once it is open. */
  readonly description: string;
  /** Position within its plan, 1-indexed. */
  readonly order: number;
  /** Inherited from the workflow. Not decided here. */
  readonly priority: Priority;
  /** Inherited from the workflow, unless the capability is role-bound. */
  readonly owner: WorkflowOwner;
  readonly effort: ActionEffort;
  readonly readiness: ActionReadiness;
  readonly target: ActionTarget;
  /** Present only for `PREPARE_DRAFT` actions. */
  readonly draft?: ActionDraft;
  readonly requires: readonly ActionDataRequirement[];
  readonly delivery: ActionDelivery;
  readonly expectedImpact: ActionImpact;
  /** Ids of actions in the same plan that should happen first. */
  readonly dependsOn: readonly string[];
  /** Records this action concerns, when the engine can name them. */
  readonly involvedEntities: readonly RelatedEntity[];
  /** Full provenance back up the pipeline. */
  readonly workflowId: string;
  readonly strategyId: string;
  readonly constraintId: string;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
}

/**
 * Every action for one workflow, in the order they should be taken.
 *
 * A plan, rather than a flat list of actions, for one reason: a bare list loses
 * which workflow an action serves, and "Open the scheduler" is meaningless
 * without it. The plan is also where the single best starting click lives.
 */
export interface ActionPlan {
  /** `plan.<workflowKey>:<clinicId>:<date>` */
  readonly id: string;
  readonly workflowId: string;
  /** Stable template key of the workflow, e.g. `retention_driven`. */
  readonly workflowKey: string;
  readonly workflowTitle: string;
  /** Inherited from the workflow. */
  readonly priority: Priority;
  readonly owner: WorkflowOwner;
  readonly timeframe: WorkflowTimeframe;
  readonly constraintId: string;
  readonly strategyId: string;
  readonly actions: readonly Action[];
  /**
   * The one action to click if only one thing gets done.
   *
   * Null only if a plan somehow has no actions, which the coverage test
   * prevents. Having the engine name it means the UI never has to guess.
   */
  readonly primaryActionId: string | null;
  readonly createdAt: string;
}
