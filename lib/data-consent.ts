import "server-only";

/**
 * lib/data-consent.ts
 *
 * Shared vocabulary for data-processing consent. Lives outside actions/ because
 * a "use server" module may only export async functions.
 *
 * See 20260903000200_data_processing_consent.sql for why this is a separate
 * model from the clinical consent system rather than more consent templates:
 * clinical consent is per-episode, indivisible and permanent; this is standing,
 * per-category and withdrawable, and the two do not fit in one table.
 */

/** Mirrors the `data_consent_category` enum. Keep the two in step. */
export const DATA_CONSENT_CATEGORIES = [
  "data_processing",
  "communications",
  "marketing",
  "ai_assisted",
] as const;

export type DataConsentCategory = (typeof DATA_CONSENT_CATEGORIES)[number];

export type DataConsentDecision = "granted" | "withdrawn";
export type DataConsentActor = "patient" | "staff";

/**
 * Categories a patient may turn OFF.
 *
 * `data_processing` is absent, and that absence is deliberate rather than an
 * oversight. A clinic cannot treat someone without keeping a record of the
 * treatment — the record IS the care, and professional record-keeping duties
 * outlive any preference about them. Offering a toggle that the product could
 * not honour would be worse than offering none: it would tell a patient
 * something untrue about what they control.
 *
 * What a patient can do about that category is ask the clinic, which is what
 * the published policy tells them (the clinic is the party that decides, not
 * OraMedha). So the portal SHOWS the notice for it — people are entitled to
 * know what is held and why — and does not pretend it is optional.
 */
export const WITHDRAWABLE_CATEGORIES: readonly DataConsentCategory[] = [
  "communications",
  "marketing",
  "ai_assisted",
];

export function isWithdrawable(category: DataConsentCategory): boolean {
  return WITHDRAWABLE_CATEGORIES.includes(category);
}

/**
 * Short labels for the portal. The full explanation is the notice `summary`
 * from the database — never hardcoded here, so revising the wording is a new
 * notice version rather than a code deploy.
 */
export const CATEGORY_LABELS: Record<DataConsentCategory, string> = {
  data_processing: "Your dental records",
  communications: "Appointment reminders",
  marketing: "Offers and practice news",
  ai_assisted: "AI-assisted summaries",
};

/**
 * The default position for a category with no recorded decision.
 *
 * `marketing` and `ai_assisted` default to NOT granted: silence is not consent,
 * and a patient who has never been asked has not agreed to promotional contact
 * or to having their record summarised by a third-party model.
 *
 * `communications` defaults to granted because it is the operational contact a
 * patient booked an appointment in order to receive — a reminder about the
 * appointment you made is not a separate favour being asked of you. A clinic
 * whose counsel disagrees can set the default the other way here; it is one
 * constant, and it is the only place the question is decided.
 *
 * `data_processing` defaults to granted for the reason above: the record exists
 * because care was given.
 */
export const DEFAULT_DECISION: Record<DataConsentCategory, DataConsentDecision> = {
  data_processing: "granted",
  communications: "granted",
  marketing: "withdrawn",
  ai_assisted: "withdrawn",
};

/** Where a decision was taken. A fixed vocabulary — never free text from a user. */
export type DataConsentSource = "portal-privacy-choices" | "front-desk";

/** The notice a person is shown, as stored. */
export type DataConsentNotice = {
  id: string;
  category: DataConsentCategory;
  version: number;
  locale: string;
  summary: string;
  policy_url: string | null;
};

/** One category's current position, as the portal renders it. */
export type DataConsentState = {
  category: DataConsentCategory;
  label: string;
  decision: DataConsentDecision;
  /** false when nobody has ever been asked and DEFAULT_DECISION applies. */
  recorded: boolean;
  withdrawable: boolean;
  notice: DataConsentNotice | null;
  occurredAt: string | null;
  actor: DataConsentActor | null;
};

/**
 * Picks the notice that applies to a clinic and category: the clinic's own
 * highest version if it has authored one, otherwise the platform default.
 *
 * Written as a pure function over already-fetched rows so it is testable
 * without a database — the precedence rule is the part that goes wrong.
 */
export function selectApplicableNotice(
  notices: ReadonlyArray<DataConsentNotice & { clinic_id: string | null }>,
  clinicId: string,
  category: DataConsentCategory,
  locale = "en"
): DataConsentNotice | null {
  const candidates = notices.filter(
    (n) => n.category === category && n.locale === locale
  );
  if (candidates.length === 0) return null;

  const clinicOwn = candidates.filter((n) => n.clinic_id === clinicId);
  const pool = clinicOwn.length > 0 ? clinicOwn : candidates.filter((n) => n.clinic_id === null);
  if (pool.length === 0) return null;

  return pool.reduce((best, n) => (n.version > best.version ? n : best));
}
