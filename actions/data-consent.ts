"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { privacyPolicyUrl } from "@/lib/legal/links";
import {
  CATEGORY_LABELS,
  DATA_CONSENT_CATEGORIES,
  DEFAULT_DECISION,
  isWithdrawable,
  selectApplicableNotice,
  type DataConsentActor,
  type DataConsentCategory,
  type DataConsentDecision,
  type DataConsentNotice,
  type DataConsentSource,
  type DataConsentState,
} from "@/lib/data-consent";
import type { ActionResult } from "@/types";

/**
 * actions/data-consent.ts
 *
 * Reading and recording data-processing consent.
 *
 * WHY EVERY WRITE GOES THROUGH THE SERVICE ROLE
 *   data_consent_records has no client INSERT policy — the same shape
 *   consent_audit uses. That is what guarantees the frozen notice_snapshot on
 *   each row matches a notice that actually exists, rather than something a
 *   client composed and posted directly to PostgREST. Authorisation is fully
 *   resolved here, in application code, before the privileged write happens.
 *
 * WHAT IS NEVER DONE HERE
 *   No row is ever updated or deleted. Withdrawing is an INSERT with
 *   decision = 'withdrawn'; the earlier grant stays exactly where it is,
 *   because the question the ledger is asked is "was this lawful at the time",
 *   and an overwritten grant cannot answer it. A database trigger enforces this
 *   independently of anything written here.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const CategorySchema = z.enum(DATA_CONSENT_CATEGORIES);
const DecisionSchema = z.enum(["granted", "withdrawn"]);

const SetOwnConsentSchema = z.object({
  category: CategorySchema,
  decision: DecisionSchema,
});

const RecordForPatientSchema = z.object({
  patientId: z.string().uuid(),
  category: CategorySchema,
  decision: DecisionSchema,
});

type NoticeRow = DataConsentNotice & { clinic_id: string | null };

async function loadNotices(db: DbClient): Promise<NoticeRow[]> {
  const { data } = await db
    .from("data_consent_notices")
    .select("id, clinic_id, category, version, locale, summary, policy_url");
  return (data ?? []) as NoticeRow[];
}

/**
 * The notice as it will be frozen onto a decision row.
 *
 * policy_url is resolved at write time from lib/legal/links.ts rather than read
 * from the database. The database deliberately stores no domain (see the
 * migration): a URL frozen into a migration outlives the domain it names, and
 * the marketing origin is per-deployment configuration.
 */
function snapshotOf(notice: DataConsentNotice | null, category: DataConsentCategory) {
  return {
    category,
    version: notice?.version ?? 0,
    locale: notice?.locale ?? "en",
    summary: notice?.summary ?? null,
    policy_url: notice?.policy_url ?? privacyPolicyUrl(),
  };
}

/**
 * Builds the current position for every category for one patient.
 *
 * `rows` is the latest decision per category, from patient_data_consent_state.
 * A category with no row falls back to DEFAULT_DECISION and is marked
 * `recorded: false`, so the UI can distinguish "they chose this" from "nobody
 * has asked yet" — which are different facts and should not look identical.
 */
function buildState(
  notices: NoticeRow[],
  clinicId: string,
  rows: ReadonlyArray<{
    category: DataConsentCategory;
    decision: DataConsentDecision;
    occurred_at: string;
    actor: DataConsentActor;
  }>
): DataConsentState[] {
  const byCategory = new Map(rows.map((r) => [r.category, r]));

  return DATA_CONSENT_CATEGORIES.map((category) => {
    const row = byCategory.get(category);
    return {
      category,
      label: CATEGORY_LABELS[category],
      decision: row?.decision ?? DEFAULT_DECISION[category],
      recorded: row !== undefined,
      withdrawable: isWithdrawable(category),
      notice: selectApplicableNotice(notices, clinicId, category),
      occurredAt: row?.occurred_at ?? null,
      actor: row?.actor ?? null,
    };
  });
}

// =============================================================================
// getMyDataConsents — portal patient, their own position
// =============================================================================

export async function getMyDataConsents(): Promise<ActionResult<DataConsentState[]>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "patient") return { data: null, error: "Forbidden" };

    // RLS on the view scopes this to the caller's own patient_id — no
    // patient_id is passed in, and none is trusted from the client.
    const [{ data: rows }, notices] = await Promise.all([
      db
        .from("patient_data_consent_state")
        .select("category, decision, occurred_at, actor"),
      loadNotices(db),
    ]);

    return {
      data: buildState(notices, profile.clinic_id, rows ?? []),
      error: null,
    };
  } catch (err) {
    console.error("[getMyDataConsents] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// setMyDataConsent — portal patient, recording their own choice
// =============================================================================

export async function setMyDataConsent(
  input: unknown
): Promise<ActionResult<DataConsentState[]>> {
  try {
    const parsed = SetOwnConsentSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    const { category, decision } = parsed.data;

    const { db, profile, user } = await resolveSession();
    if (!profile || !user) return { data: null, error: "Unauthorized" };
    if (profile.role !== "patient") return { data: null, error: "Forbidden" };

    // A category the product cannot actually honour is not offered as a choice.
    // Rejecting it here rather than recording an unhonourable "withdrawn" keeps
    // the ledger truthful: every granted row in it means something is happening,
    // and every withdrawn row means something has stopped.
    if (!isWithdrawable(category) && decision === "withdrawn") {
      return {
        data: null,
        error:
          "Your clinic has to keep a record of your treatment, so this one cannot be turned off here. Please speak to your clinic about your records.",
      };
    }

    // Resolve the patient from the portal link server-side. The client sends a
    // category and a decision and nothing else — never an identity.
    const { data: link } = await db
      .from("patient_portal_links")
      .select("patient_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!link?.patient_id) {
      return { data: null, error: "Portal account not linked." };
    }

    const notices = await loadNotices(db);
    const notice = selectApplicableNotice(notices, profile.clinic_id, category);

    const written = await writeDecision({
      clinicId: profile.clinic_id,
      patientId: link.patient_id as string,
      category,
      decision,
      notice,
      actor: "patient",
      recordedBy: profile.id,
      recordedByRole: profile.role,
      source: "portal-privacy-choices",
    });
    if (written) return { data: null, error: written };

    revalidatePath("/portal/profile");

    return await getMyDataConsents();
  } catch (err) {
    console.error("[setMyDataConsent] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// getPatientDataConsents — staff, for one patient in their clinic
// =============================================================================

export async function getPatientDataConsents(
  patientId: string
): Promise<ActionResult<DataConsentState[]>> {
  try {
    if (!patientId) return { data: null, error: "Patient ID is required" };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }

    const [{ data: rows }, notices] = await Promise.all([
      db
        .from("patient_data_consent_state")
        .select("category, decision, occurred_at, actor")
        .eq("patient_id", patientId)
        .eq("clinic_id", profile.clinic_id),
      loadNotices(db),
    ]);

    return {
      data: buildState(notices, profile.clinic_id, rows ?? []),
      error: null,
    };
  } catch (err) {
    console.error("[getPatientDataConsents] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// recordDataConsentForPatient — staff recording a choice made in person
// =============================================================================

export async function recordDataConsentForPatient(
  input: unknown
): Promise<ActionResult<DataConsentState[]>> {
  try {
    const parsed = RecordForPatientSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    const { patientId, category, decision } = parsed.data;

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }

    if (!isWithdrawable(category) && decision === "withdrawn") {
      return {
        data: null,
        error: "This category cannot be withdrawn — the clinical record must be kept.",
      };
    }

    // The patient must be in the caller's own clinic. Checked against the
    // database rather than inferred, so a patient_id from another tenant fails
    // here and never reaches the service-role write below.
    const { data: patient } = await db
      .from("patients")
      .select("id")
      .eq("id", patientId)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!patient) return { data: null, error: "Patient not found." };

    const notices = await loadNotices(db);
    const notice = selectApplicableNotice(notices, profile.clinic_id, category);

    const written = await writeDecision({
      clinicId: profile.clinic_id,
      patientId,
      category,
      decision,
      notice,
      // Marked as staff-recorded, not patient-chosen. Weaker evidence, and the
      // record says so rather than quietly presenting it as the patient's own act.
      actor: "staff",
      recordedBy: profile.id,
      recordedByRole: profile.role,
      source: "front-desk",
    });
    if (written) return { data: null, error: written };

    revalidatePath(`/dentist/patients/${patientId}`);
    revalidatePath(`/receptionist/patients/${patientId}`);

    return await getPatientDataConsents(patientId);
  } catch (err) {
    console.error("[recordDataConsentForPatient] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// The one privileged write
// =============================================================================

/**
 * Appends a decision. Returns an error message, or null on success.
 *
 * Every caller has already resolved authorisation; this function performs no
 * check of its own and is not exported, so there is exactly one path to an
 * insert and it is reachable only from the two actions above.
 */
async function writeDecision(params: {
  clinicId: string;
  patientId: string;
  category: DataConsentCategory;
  decision: DataConsentDecision;
  notice: DataConsentNotice | null;
  actor: DataConsentActor;
  recordedBy: string;
  recordedByRole: string;
  source: DataConsentSource;
}): Promise<string | null> {
  const admin: DbClient = createAdminClient();

  const { error } = await admin.from("data_consent_records").insert({
    clinic_id: params.clinicId,
    patient_id: params.patientId,
    category: params.category,
    decision: params.decision,
    notice_id: params.notice?.id ?? null,
    notice_version: params.notice?.version ?? 0,
    notice_snapshot: snapshotOf(params.notice, params.category),
    actor: params.actor,
    recorded_by: params.recordedBy,
    recorded_by_role: params.recordedByRole,
    source: params.source,
  });

  if (error) {
    console.error("[data-consent] write failed", {
      category: params.category,
      decision: params.decision,
      code: error.code,
      message: error.message,
    });
    return "Could not save that choice. Please try again.";
  }

  return null;
}
