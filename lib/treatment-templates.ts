/**
 * treatment-templates.ts
 *
 * Client-side treatment type catalogue.
 *
 * Provides default_duration_minutes and default_cost for each treatment type.
 * These defaults are used in the appointment form to auto-populate duration
 * when a treatment type is selected. Staff can always manually override.
 *
 * No DB table required — these are application-level defaults.
 * Actual treatment records store their own cost/duration independently.
 */

export interface TreatmentTemplate {
  /** Display name shown in UI dropdowns */
  label: string;
  /** Canonical value stored in treatments.treatment_type */
  value: string;
  /** Default appointment duration in minutes */
  defaultDurationMinutes: number;
  /** Default cost in local currency (INR) — advisory only, staff can override */
  defaultCost: number;
}

export const TREATMENT_TEMPLATES: TreatmentTemplate[] = [
  {
    value: "consultation",
    label: "Consultation",
    defaultDurationMinutes: 10,
    defaultCost: 200,
  },
  {
    value: "cleaning",
    label: "Cleaning",
    defaultDurationMinutes: 20,
    defaultCost: 500,
  },
  {
    value: "filling",
    label: "Filling",
    defaultDurationMinutes: 30,
    defaultCost: 800,
  },
  {
    value: "extraction",
    label: "Extraction",
    defaultDurationMinutes: 30,
    defaultCost: 600,
  },
  {
    value: "root_canal",
    label: "Root Canal",
    defaultDurationMinutes: 60,
    defaultCost: 5000,
  },
  {
    value: "crown_placement",
    label: "Crown Placement",
    defaultDurationMinutes: 45,
    defaultCost: 8000,
  },
  {
    value: "implant",
    label: "Implant",
    defaultDurationMinutes: 90,
    defaultCost: 25000,
  },
  {
    value: "teeth_whitening",
    label: "Teeth Whitening",
    defaultDurationMinutes: 45,
    defaultCost: 3000,
  },
  {
    value: "braces_fitting",
    label: "Braces Fitting",
    defaultDurationMinutes: 60,
    defaultCost: 15000,
  },
  {
    value: "x_ray",
    label: "X-Ray",
    defaultDurationMinutes: 15,
    defaultCost: 300,
  },
  {
    value: "other",
    label: "Other",
    defaultDurationMinutes: 30,
    defaultCost: 0,
  },
];

/** Lookup map for O(1) access by treatment type value */
export const TREATMENT_TEMPLATE_MAP = new Map(
  TREATMENT_TEMPLATES.map((t) => [t.value, t])
);

/**
 * getDurationForTreatment
 *
 * Returns the default duration for a given treatment type value.
 * Falls back to 30 minutes if the type is not found.
 */
export function getDurationForTreatment(treatmentType: string): number {
  return TREATMENT_TEMPLATE_MAP.get(treatmentType)?.defaultDurationMinutes ?? 30;
}

/**
 * getCostForTreatment
 *
 * Returns the default cost for a given treatment type value.
 * Falls back to 0 if the type is not found.
 */
export function getCostForTreatment(treatmentType: string): number {
  return TREATMENT_TEMPLATE_MAP.get(treatmentType)?.defaultCost ?? 0;
}
