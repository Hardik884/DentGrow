import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ResolvedProfile } from "@/lib/auth/session";

/**
 * types/database.types.ts is generated from the local database and does not
 * yet know about phi_access_log (regenerating it needs a running local stack
 * and would restate every unrelated type in the same commit). The data layer is
 * cast at this boundary, which is the convention the Server Actions already use
 * for the same reason — see the DbClient alias in lib/auth/session.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuditClient = any;

/**
 * lib/audit/phi-access.ts
 *
 * The one way sensitive-record reads get recorded.
 *
 * WHY A HELPER RATHER THAN AN INSERT AT EACH CALL SITE
 *   An audit trail written twenty different ways is twenty chances to write a
 *   patient's name into it, to forget the clinic scope, or to let a failed
 *   insert take down the page it was auditing. This module makes those three
 *   mistakes impossible to make at the call site:
 *
 *     1. `context` is filtered through an ALLOW-LIST. A key that is not on the
 *        list is dropped, and a value that is not a small scalar is dropped.
 *        There is no path by which a caller can pass `{ name }` and have it
 *        stored, even by accident.
 *     2. clinic_id, actor_id and actor_role always come from the resolved
 *        server session, never from an argument.
 *     3. Failure is swallowed. Auditing a read must never prevent a dentist
 *        from seeing a record — a clinic that cannot open a chart because the
 *        log is unavailable is a worse outcome than a missing log line. The
 *        failure is logged loudly instead, which is what monitoring watches.
 *
 * WHY THE SERVICE ROLE
 *   phi_access_log has no client write policy, by design: a session that could
 *   insert into it could also be made to insert misleading rows, and staff must
 *   not be able to touch their own trail. Writes therefore come from the
 *   service-role client, and a database trigger blocks UPDATE and unscoped
 *   DELETE even for that client.
 *
 * WHAT IS NOT AUDITED, DELIBERATELY
 *   Not every render. A patient list that repaints on a filter change is not
 *   twenty accesses, and a log full of those buries the one row that matters.
 *   The rule applied at the call sites is: record a read that RESOLVES A
 *   SPECIFIC PERSON'S RECORD, or that makes a stored document retrievable.
 */

/**
 * Event kinds. Mirrors the `phi_access_event` enum in
 * 20260903000000_phi_access_log.sql — keep the two in step.
 */
export type PhiAccessEvent =
  | "PATIENT_VIEWED"
  | "PATIENT_SEARCHED"
  | "PATIENT_LIST_VIEWED"
  | "CLINICAL_RECORD_VIEWED"
  | "DENTAL_CHART_VIEWED"
  | "TREATMENT_VIEWED"
  | "PRESCRIPTION_VIEWED"
  | "PAYMENT_VIEWED"
  | "DOCUMENT_VIEWED"
  | "XRAY_VIEWED"
  | "CONSENT_VIEWED"
  | "PATIENT_DATA_EXPORTED"
  | "AI_CONTEXT_PREPARED";

/**
 * The ONLY keys that may appear in `context`.
 *
 * Every one of them is a count, a fixed vocabulary word, or a boolean. None can
 * carry a name, a number that identifies a person, a clinical detail, or
 * anything a user typed. Adding a key here is a privacy decision, not a
 * convenience one — the question to ask is "could this value ever differ
 * between two patients in a way that describes one of them?"
 */
const ALLOWED_CONTEXT_KEYS = [
  /** How many records the read returned. Not which. */
  "count",
  /** Which product surface the read came from, e.g. "patient-profile". */
  "surface",
  /** Why a read was refused, from a fixed vocabulary, e.g. "wrong-clinic". */
  "reason",
  /** Which AI feature assembled context, e.g. "patient-summary". */
  "feature",
  /** Which storage bucket a document was served from. */
  "bucket",
  /** Lifetime in seconds of a signed URL that was issued. */
  "ttlSeconds",
  /** Whether the read was performed on the reader's own record (portal). */
  "self",
  /** How many characters a search term was. NEVER the term itself. */
  "queryLength",
] as const;

export type PhiAccessContextKey = (typeof ALLOWED_CONTEXT_KEYS)[number];

export type PhiAccessContext = Partial<
  Record<PhiAccessContextKey, string | number | boolean>
>;

/** Values longer than this are truncated; a long string is a smell, not data. */
const MAX_CONTEXT_STRING = 64;

/**
 * Strips anything not explicitly permitted.
 *
 * Exported because it is the security-relevant half of this module and is
 * tested directly: the spec passes it a patient's name, phone and clinical note
 * under both allowed and disallowed keys and asserts none of it survives.
 */
export function sanitizeContext(context: PhiAccessContext | undefined): Record<
  string,
  string | number | boolean
> {
  if (!context) return {};

  const clean: Record<string, string | number | boolean> = {};

  for (const key of ALLOWED_CONTEXT_KEYS) {
    const value = context[key];
    if (value === undefined || value === null) continue;

    if (typeof value === "number") {
      // Reject NaN/Infinity, which serialise to null and make the row confusing.
      if (Number.isFinite(value)) clean[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      clean[key] = value;
      continue;
    }
    if (typeof value === "string") {
      // Collapse whitespace and truncate. A value that needs more than 64
      // characters is not a surface name or a reason code, and the truncation
      // is a deliberate backstop rather than a formatting nicety.
      clean[key] = value.replace(/\s+/g, " ").trim().slice(0, MAX_CONTEXT_STRING);
      continue;
    }
    // Objects, arrays and functions are dropped entirely — that is the shape a
    // whole record would arrive in.
  }

  return clean;
}

export type PhiAccessRecord = {
  event: PhiAccessEvent;
  /** The kind of row `resourceId` points at: "patient", "treatment", … */
  resourceType: string;
  /** The row that was read. Omit for reads not scoped to a single row. */
  resourceId?: string | null;
  /** Whose record was read. Omit for reads not scoped to a single patient. */
  patientId?: string | null;
  /** false records a REFUSED access. Those rows are the security signal. */
  allowed?: boolean;
  context?: PhiAccessContext;
};

/**
 * Records one sensitive-record read.
 *
 * `profile` is the caller's server-resolved profile — the clinic and role are
 * taken from it and never from an argument, so a call site cannot mis-attribute
 * a read to another clinic even by mistake.
 *
 * Never throws, and never rejects. Callers do not need to guard it.
 */
export async function recordPhiAccess(
  profile: Pick<ResolvedProfile, "id" | "clinic_id" | "role">,
  record: PhiAccessRecord
): Promise<void> {
  try {
    const admin: AuditClient = createAdminClient();

    const { error } = await admin.from("phi_access_log").insert({
      clinic_id: profile.clinic_id,
      actor_id: profile.id,
      actor_role: profile.role,
      event: record.event,
      resource_type: record.resourceType,
      resource_id: record.resourceId ?? null,
      patient_id: record.patientId ?? null,
      allowed: record.allowed ?? true,
      context: sanitizeContext(record.context),
    });

    if (error) {
      // Deliberately not rethrown. Logged with identifiers only, matching the
      // table's own rule about what may be written down.
      console.error("[phi-audit] insert failed", {
        event: record.event,
        resourceType: record.resourceType,
        code: error.code,
        message: error.message,
      });
    }
  } catch (err) {
    console.error("[phi-audit] unexpected", {
      event: record.event,
      resourceType: record.resourceType,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}

/**
 * Records several reads in one round-trip.
 *
 * Used where one action legitimately resolves a handful of distinct patients'
 * records at once — issuing signed URLs for a set of documents, for example.
 * A loop of single inserts would multiply latency on a path that is already
 * doing real work.
 */
export async function recordPhiAccessBatch(
  profile: Pick<ResolvedProfile, "id" | "clinic_id" | "role">,
  records: PhiAccessRecord[]
): Promise<void> {
  if (records.length === 0) return;

  try {
    const admin: AuditClient = createAdminClient();
    const rows = records.map((record) => ({
      clinic_id: profile.clinic_id,
      actor_id: profile.id,
      actor_role: profile.role,
      event: record.event,
      resource_type: record.resourceType,
      resource_id: record.resourceId ?? null,
      patient_id: record.patientId ?? null,
      allowed: record.allowed ?? true,
      context: sanitizeContext(record.context),
    }));

    const { error } = await admin.from("phi_access_log").insert(rows);

    if (error) {
      console.error("[phi-audit] batch insert failed", {
        rows: rows.length,
        code: error.code,
        message: error.message,
      });
    }
  } catch (err) {
    console.error("[phi-audit] batch unexpected", {
      rows: records.length,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
