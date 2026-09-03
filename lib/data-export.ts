import "server-only";

/**
 * lib/data-export.ts
 *
 * The shape of a patient-data export, and the rules about what may be in one.
 *
 * HOW AN EXPORT IS DELIVERED, AND WHY THAT WAY
 *   It is returned from the Server Action to the caller who asked for it, and
 *   the browser turns it into a file. Nothing is written to storage, no URL is
 *   minted, and no object exists afterwards.
 *
 *   That is the point. The brief for this feature asked that an export "not
 *   become publicly accessible" and "have a limited lifetime" — and the way to
 *   guarantee both is not to give it a shorter TTL, it is not to create an
 *   artefact at all. A generated file sitting in a bucket is a second copy of
 *   somebody's entire medical history whose only protection is a URL, which is
 *   exactly the failure mode a signed radiograph link already has, multiplied
 *   by the size of the export. The data crosses the wire once, inside the
 *   authenticated response to the request that asked for it, and lives only
 *   wherever the person chose to save it.
 *
 * TWO AUDIENCES, TWO SCOPES
 *   A patient exporting their own record gets what the portal already shows
 *   them. A dentist exporting on a patient's behalf — to answer an access
 *   request, or to transfer care — gets the clinical record including
 *   internal_notes, because they are the clinician and it is their record to
 *   hand over.
 *
 *   That split is a product decision, not a legal conclusion. Whether a patient
 *   is entitled to the dentist's private clinical notes on demand depends on
 *   law this code does not attempt to settle (see docs/DATA-PROTECTION.md). The
 *   architecture keeps the categories explicit and separable so the answer can
 *   be applied without redesigning anything.
 *
 * WHAT IS NEVER IN AN EXPORT, IN EITHER SCOPE
 *   Other patients. Other clinics. Staff accounts or credentials. The security
 *   and access logs (phi_access_log) — an export must not become a way to read
 *   who has been looking at a record. Internal revenue splits and consultant
 *   commissions, which are the clinic's commercial arrangements and not a fact
 *   about the patient. Secrets of any kind.
 */

/** Fields of `treatments` a PATIENT's own export may contain. */
export const PATIENT_TREATMENT_FIELDS = [
  "id",
  "treatment_type",
  "patient_visible_notes",
  "medications",
  "cost",
  "opd_charged",
  "opd_fee",
  "xray_taken",
  "xray_cost",
  "status",
  "performed_at",
  "tooth_number",
  "dentition_type",
  "created_at",
] as const;

/**
 * Additional fields a STAFF export may contain.
 *
 * internal_notes is the dentist's own clinical record of the encounter. It is
 * excluded from the patient self-service export because the portal has never
 * shown it (CLAUDE.md §5.4) and changing that silently, inside an export
 * feature, would be a clinical-disclosure decision made by a migration.
 */
export const STAFF_ONLY_TREATMENT_FIELDS = ["internal_notes"] as const;

/**
 * Fields that must NEVER appear in any export.
 *
 * The revenue split is the clinic's commercial arrangement with a consultant.
 * It is attached to a treatment row for accounting reasons and is not
 * information about the patient; handing it over would disclose a third party's
 * pay to someone with no business knowing it.
 */
export const NEVER_EXPORTED_TREATMENT_FIELDS = [
  "consultant_id",
  "commission_type",
  "commission_value",
  "consultant_share",
  "clinic_share",
  "created_by",
] as const;

export type ExportScope = "patient" | "staff";

/** Treatment columns to select for a given scope. */
export function treatmentFieldsFor(scope: ExportScope): string[] {
  return scope === "staff"
    ? [...PATIENT_TREATMENT_FIELDS, ...STAFF_ONLY_TREATMENT_FIELDS]
    : [...PATIENT_TREATMENT_FIELDS];
}

/**
 * Strips anything not on the allow-list for the scope.
 *
 * Belt and braces over the SELECT: the select list is what should keep an
 * unexpected column out, and this is what catches it if a `select("*")` ever
 * creeps into one of these queries during a refactor.
 */
export function pickTreatmentFields<T extends Record<string, unknown>>(
  row: T,
  scope: ExportScope
): Record<string, unknown> {
  const allowed = new Set<string>(treatmentFieldsFor(scope));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (allowed.has(key)) out[key] = value;
  }
  return out;
}

/**
 * The export envelope.
 *
 * `about` deliberately carries only the patient's own identity and the clinic
 * that holds the record — enough for the file to be self-describing to whoever
 * opens it months later, which a bare array of rows is not.
 */
export type PatientDataExport = {
  export: {
    /** Bumped when the shape changes, so a consumer can tell what it is reading. */
    format_version: 1;
    generated_at: string;
    /** Which audience produced this, and therefore what is in it. */
    scope: ExportScope;
    /** Plain-language statement of what was deliberately left out. */
    excluded: string[];
  };
  clinic: Record<string, unknown> | null;
  patient: Record<string, unknown> | null;
  appointments: Record<string, unknown>[];
  treatments: Record<string, unknown>[];
  dental_chart: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  follow_ups: Record<string, unknown>[];
  clinical_consents: Record<string, unknown>[];
  data_processing_consents: Record<string, unknown>[];
  documents: Record<string, unknown>[];
};

/**
 * The "what is not here" note that ships inside every export.
 *
 * An export that silently omits things is worse than one that says what it
 * omitted: the person reading it cannot tell the difference between "the clinic
 * holds nothing else" and "the clinic did not give me everything".
 */
export function exclusionsFor(scope: ExportScope): string[] {
  const common = [
    "Records belonging to any other patient.",
    "Records held by any other clinic.",
    "Staff accounts, passwords and access credentials.",
    "Security and access logs.",
    "The clinic's internal commercial arrangements, such as consultant fee splits.",
    "The document and image FILES themselves — these are listed by name and date, and are downloaded individually from the portal.",
  ];

  if (scope === "patient") {
    return [
      ...common,
      "The dentist's private clinical notes (internal_notes). Ask your clinic if you need these.",
    ];
  }

  return common;
}
