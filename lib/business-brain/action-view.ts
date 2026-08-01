/**
 * lib/business-brain/action-view.ts
 *
 * Presentation projection of the Action Engine's plans.
 *
 * Like dashboard-view.ts and workflow-view.ts, this contains NO business logic.
 * It labels, formats, and — the one thing only this layer can do — resolves a
 * logical {@link DentGrowArea} into a real href for the role that is looking.
 *
 * ## Why routing lives here and not in the engine
 *
 * Routes are role-scoped: the same payments list is `/dentist/payments` for a
 * dentist and `/receptionist/payments` for the front desk. If the engine emitted
 * hrefs it would own routing, and renaming a route would become a change to a
 * reasoning engine. So the engine names an area plus the filters that belong on
 * it, and this file is the single place that knows what a URL looks like.
 *
 * ## What it will not do
 *
 * It does not re-rank, re-group by importance, or add advice. Order, priority,
 * owner and the primary action all arrive already decided.
 */

import type { Action, ActionPlan, DentGrowArea } from "@/business-brain";

/** Whose navigation the hrefs are built for. */
export type ActionAudience = "dentist" | "receptionist";

// ─────────────────────────────────────────────────────────────────────────────
// Area → route
//
// The one mapping table in the system that knows about URLs. `null` means the
// role has no screen for that area — a receptionist has no analytics or settings
// pages — and the card then renders without a link rather than with a broken one.
// `action-view.spec.ts` asserts every area in the domain has an entry, so adding
// an area to the engine cannot silently produce an unlinkable action.
// ─────────────────────────────────────────────────────────────────────────────

const ROUTES: Record<DentGrowArea, Record<ActionAudience, string | null>> = {
  appointments: {
    dentist: "/dentist/appointments",
    receptionist: "/receptionist/appointments",
  },
  appointment_scheduler: {
    dentist: "/dentist/appointments/new",
    receptionist: "/receptionist/appointments/new",
  },
  patients: {
    dentist: "/dentist/patients",
    receptionist: "/receptionist/patients",
  },
  patient_record: {
    // No patient is bound yet, so this resolves to the directory to search from.
    // The moment the engine can name a patient, `entity` carries the id and
    // `resolveHref` produces the record route instead — no change here.
    dentist: "/dentist/patients",
    receptionist: "/receptionist/patients",
  },
  treatments: {
    dentist: "/dentist/treatments",
    // Receptionists have no treatments module.
    receptionist: null,
  },
  payments: {
    dentist: "/dentist/payments",
    receptionist: "/receptionist/payments",
  },
  payment_form: {
    dentist: "/dentist/payments/new",
    receptionist: "/receptionist/payments/new",
  },
  follow_ups: {
    dentist: "/dentist/follow-ups",
    receptionist: null,
  },
  follow_up_form: {
    dentist: "/dentist/follow-ups/new",
    receptionist: null,
  },
  queue: {
    dentist: "/dentist/queue",
    receptionist: "/receptionist/queue",
  },
  availability_settings: {
    dentist: "/dentist/settings/availability",
    receptionist: null,
  },
  clinic_settings: {
    dentist: "/dentist/settings",
    receptionist: null,
  },
  analytics: {
    dentist: "/dentist/analytics",
    receptionist: null,
  },
};

/**
 * Build the href for one action, or null when the audience has no such screen.
 *
 * Query values are encoded, and the parameters come from a closed set defined in
 * the catalog — no user input reaches this.
 */
export function resolveHref(action: Action, audience: ActionAudience): string | null {
  const base = ROUTES[action.target.area]?.[audience] ?? null;
  if (base === null) return null;

  // A bound record wins over the list route: the point of naming an entity is to
  // land on it.
  const entity = action.target.entity;
  const path =
    entity !== undefined && action.target.area === "patient_record"
      ? `${base}/${encodeURIComponent(entity.id)}`
      : base;

  const entries = Object.entries(action.target.filters);
  if (entries.length === 0) return path;

  const query = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${path}?${query}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Labels
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  communication: "Contact",
  scheduling: "Schedule",
  patient_review: "Patients",
  financial: "Money",
  clinical: "Treatment",
  reporting: "Reports",
  configuration: "Settings",
  navigation: "Open",
};

/**
 * What the button says.
 *
 * Verbs, not nouns: the label is the thing the click does. A draft says "Prepare"
 * rather than "Send", and it says so on the button itself, which is the cheapest
 * possible place to make clear that DentGrow is not sending anything.
 */
const KIND_ACTION_LABELS: Record<string, string> = {
  open_list: "Open list",
  open_record: "Open record",
  open_form: "Open form",
  open_report: "Open report",
  prepare_list: "How to work it",
  prepare_draft: "View draft",
  review_setting: "Open settings",
};

const READINESS_LABELS: Record<string, string> = {
  prepared: "Ready to use",
  partially_prepared: "One step by hand",
  manual: "Opens the screen only",
};

const EFFORT_LABELS: Record<string, string> = {
  one_click: "One click",
  minutes: "A few minutes",
  session: "A sitting",
};

const OWNER_LABELS: Record<string, string> = {
  dentist: "Dentist",
  receptionist: "Receptionist",
  either: "Either",
};

const TIMEFRAME_LABELS: Record<string, string> = {
  today: "Today",
  this_week: "This week",
  soon: "Within 2 weeks",
  ongoing: "Ongoing",
};

// ─────────────────────────────────────────────────────────────────────────────
// View types
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionDraftView {
  readonly subject?: string;
  readonly body: string;
  readonly placeholders: readonly string[];
  /** Channels this draft could be sent over by hand today. */
  readonly channelLabels: readonly string[];
}

export interface ActionView {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly order: number;
  readonly categoryLabel: string;
  readonly category: string;
  readonly kind: string;
  readonly actionLabel: string;
  readonly readiness: "prepared" | "partially_prepared" | "manual";
  readonly readinessLabel: string;
  readonly effortLabel: string;
  readonly ownerLabel: string;
  /** Null when this audience has no screen for the action's area. */
  readonly href: string | null;
  /** Filters shown as chips so the user can see what is pre-applied. */
  readonly appliedFilters: readonly { readonly key: string; readonly value: string }[];
  readonly sortHint?: string;
  readonly impact: string;
  readonly draft?: ActionDraftView;
  /** Titles of actions in the same plan that come first. */
  readonly afterTitles: readonly string[];
  readonly isPrimary: boolean;
}

export interface ActionPlanView {
  readonly id: string;
  readonly workflowId: string;
  readonly workflowTitle: string;
  readonly priorityLabel: string;
  readonly prioritySeverity: "critical" | "high" | "medium" | "low";
  readonly ownerLabel: string;
  readonly timeframeLabel: string;
  readonly actionCount: number;
  /** The one action to click if only one thing gets done. */
  readonly primary: ActionView | null;
  /** Everything else, in plan order. */
  readonly rest: readonly ActionView[];
}

export interface ActionSummary {
  readonly planCount: number;
  readonly actionCount: number;
  /** Actions that open fully prepared — the one-click count. */
  readonly preparedCount: number;
  readonly draftCount: number;
  readonly todayPlanCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Projection
// ─────────────────────────────────────────────────────────────────────────────

/** Human names for the filter keys, so a chip reads as English. */
const FILTER_KEY_LABELS: Record<string, string> = {
  status: "Status",
  filter: "Group",
  dateFrom: "From",
  dateTo: "To",
  from: "From",
  to: "To",
  treatmentType: "Treatment",
  paymentType: "Payment type",
  confirmation: "Confirmation",
  tab: "Tab",
  search: "Search",
};

const FILTER_VALUE_LABELS: Record<string, string> = {
  no_show: "No-show",
  in_progress: "In progress",
  inactive: "Not seen in 6 months",
  active: "Seen in 6 months",
  new: "Registered today",
};

function humanise(value: string): string {
  const words = value.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const CHANNEL_LABELS: Record<string, string> = {
  in_app: "In DentGrow",
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
  push: "Push",
  voice: "Call",
  calendar: "Calendar",
};

function toActionView(
  action: Action,
  plan: ActionPlan,
  audience: ActionAudience,
  titleById: ReadonlyMap<string, string>,
): ActionView {
  return {
    id: action.id,
    title: action.title,
    description: action.description,
    order: action.order,
    category: action.category,
    categoryLabel: CATEGORY_LABELS[action.category] ?? humanise(action.category),
    kind: action.kind,
    actionLabel: KIND_ACTION_LABELS[action.kind] ?? "Open",
    readiness: action.readiness,
    readinessLabel: READINESS_LABELS[action.readiness] ?? humanise(action.readiness),
    effortLabel: EFFORT_LABELS[action.effort] ?? humanise(action.effort),
    ownerLabel: OWNER_LABELS[action.owner] ?? humanise(action.owner),
    // A draft has nowhere to navigate to — its content IS the action — so it
    // deliberately carries no href even though its area resolves to one.
    href: action.kind === "prepare_draft" ? null : resolveHref(action, audience),
    appliedFilters: Object.entries(action.target.filters).map(([key, value]) => ({
      key: FILTER_KEY_LABELS[key] ?? humanise(key),
      value: FILTER_VALUE_LABELS[value] ?? value,
    })),
    sortHint: action.target.sortHint,
    impact: action.expectedImpact.statement,
    draft:
      action.draft === undefined
        ? undefined
        : {
            subject: action.draft.subject,
            body: action.draft.body,
            placeholders: action.draft.placeholders,
            channelLabels: action.delivery.supportedChannels
              .filter((c) => c !== "in_app")
              .map((c) => CHANNEL_LABELS[c] ?? humanise(c)),
          },
    afterTitles: action.dependsOn
      .map((id) => titleById.get(id))
      .filter((t): t is string => t !== undefined),
    isPrimary: action.id === plan.primaryActionId,
  };
}

/** Project the engine's plans into what the Ready Actions section renders. */
export function buildActionPlanViews(
  plans: readonly ActionPlan[],
  audience: ActionAudience = "dentist",
): readonly ActionPlanView[] {
  return plans.map((plan) => {
    const titleById = new Map(plan.actions.map((a) => [a.id, a.title]));
    const views = plan.actions.map((a) => toActionView(a, plan, audience, titleById));
    const primary = views.find((v) => v.isPrimary) ?? null;

    return {
      id: plan.id,
      workflowId: plan.workflowId,
      workflowTitle: plan.workflowTitle,
      priorityLabel: humanise(plan.priority),
      prioritySeverity: plan.priority as ActionPlanView["prioritySeverity"],
      ownerLabel: OWNER_LABELS[plan.owner] ?? humanise(plan.owner),
      timeframeLabel: TIMEFRAME_LABELS[plan.timeframe] ?? humanise(plan.timeframe),
      actionCount: views.length,
      primary,
      rest: views.filter((v) => !v.isPrimary),
    };
  });
}

export function buildActionSummary(plans: readonly ActionPlan[]): ActionSummary {
  const actions = plans.flatMap((p) => p.actions);
  return {
    planCount: plans.length,
    actionCount: actions.length,
    preparedCount: actions.filter((a) => a.readiness === "prepared").length,
    draftCount: actions.filter((a) => a.draft !== undefined).length,
    todayPlanCount: plans.filter((p) => p.timeframe === "today").length,
  };
}
