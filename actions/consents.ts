"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { resolveSession as resolveCachedSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeConsentAudit } from "@/lib/consents/history";
import { applyConsentEdits, buildConsentSnapshot } from "@/lib/consents/build";
import type { ConsentContent, ConsentSnapshot } from "@/lib/consents/content";
import {
  DEFAULT_TEMPLATE_BY_KEY,
  selectTemplateKeyForTreatmentType,
  type ConsentTemplateKey,
} from "@/lib/consents/templates";
import { isConsentEditable, canSignConsent, canCancelConsent } from "@/lib/consents/status";
import { isConsentFormsEnabled, CONSENT_FORMS_DISABLED_MESSAGE } from "@/lib/consents/flag";
import {
  CONSENT_BUCKET,
  consentObjectPath,
  validateConsentUpload,
} from "@/lib/consents/constants";
import { ensureConsentTemplates } from "@/actions/consent-templates";
import {
  CreateConsentSchema,
  UpdateConsentSchema,
  SignConsentSchema,
  UploadConsentMetaSchema,
  type ActionResult,
  type Consent,
} from "@/types";

/**
 * Patient Consent Forms — Server Actions
 *
 * Digital consents are authored, edited, and SIGNED by the dentist; once signed
 * the content_snapshot is frozen and the DB refuses further edits (RLS +
 * status guard). Uploaded consents (source='uploaded') let staff attach an
 * externally-signed paper document. Every mutation writes an append-only
 * consent_audit row.
 *
 * clinic_id, role, and the acting user are ALWAYS sourced from the server
 * session — never trusted from the client.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;
type ResolvedProfile = {
  id: string;
  clinic_id: string;
  role: "dentist" | "receptionist" | "patient";
  full_name: string | null;
};

async function resolveSession(): Promise<{ db: DbClient; profile: ResolvedProfile | null }> {
  const { db, profile } = await resolveCachedSession();
  return { db, profile };
}

// ── Resolution helpers (mirror actions/billing.ts) ───────────────────────────

async function fetchClinicInfo(db: DbClient, clinicId: string) {
  const { data } = await db
    .from("clinic_settings")
    .select("clinic_name, address, phone, email, registration_number")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  return {
    name: (data?.clinic_name as string | undefined) ?? "Dental Clinic",
    address: (data?.address as string | null | undefined) ?? null,
    phone: (data?.phone as string | null | undefined) ?? null,
    email: (data?.email as string | null | undefined) ?? null,
    registrationNumber: (data?.registration_number as string | null | undefined) ?? null,
  };
}

async function fetchPatient(db: DbClient, clinicId: string, patientId: string) {
  const { data } = await db
    .from("patients")
    .select("id, name, phone, date_of_birth")
    .eq("id", patientId)
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle();
  return data as { id: string; name: string; phone: string | null; date_of_birth: string | null } | null;
}

/** Load a clinic's template + current-version content by key (fallback general). */
async function loadTemplate(
  db: DbClient,
  clinicId: string,
  key: string
): Promise<{
  templateId: string;
  versionId: string;
  version: number;
  name: string;
  content: ConsentContent;
} | null> {
  const safeKey: ConsentTemplateKey = DEFAULT_TEMPLATE_BY_KEY[key as ConsentTemplateKey]
    ? (key as ConsentTemplateKey)
    : "general";

  const { data: tmpl } = await db
    .from("consent_templates")
    .select("id, name, current_version")
    .eq("clinic_id", clinicId)
    .eq("template_key", safeKey)
    .maybeSingle();
  if (!tmpl) return null;

  const { data: ver } = await db
    .from("consent_template_versions")
    .select("id, content")
    .eq("template_id", tmpl.id)
    .eq("version", tmpl.current_version)
    .maybeSingle();
  if (!ver) return null;

  return {
    templateId: tmpl.id as string,
    versionId: ver.id as string,
    version: tmpl.current_version as number,
    name: tmpl.name as string,
    content: ver.content as ConsentContent,
  };
}

// =============================================================================
// createConsent — dentist — create a DRAFT digital consent from a treatment
// =============================================================================

export async function createConsent(input: unknown): Promise<ActionResult<Consent>> {
  try {
    const parsed = CreateConsentSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can create consents." };
    }
    if (!(await isConsentFormsEnabled(db, profile.clinic_id))) {
      return { data: null, error: CONSENT_FORMS_DISABLED_MESSAGE };
    }

    const patient = await fetchPatient(db, profile.clinic_id, parsed.data.patient_id);
    if (!patient) return { data: null, error: "Patient not found." };

    await ensureConsentTemplates(profile.clinic_id, profile.id);
    const template = await loadTemplate(db, profile.clinic_id, parsed.data.template_key);
    if (!template) return { data: null, error: "Consent template not found." };

    const clinic = await fetchClinicInfo(db, profile.clinic_id);
    const content = applyConsentEdits(template.content, parsed.data.section_edits);

    // Resolve the treatment type (for the printed heading) from the treatment.
    let treatmentType: string | null = null;
    if (parsed.data.treatment_id) {
      const { data: tr } = await db
        .from("treatments")
        .select("treatment_type")
        .eq("id", parsed.data.treatment_id)
        .eq("clinic_id", profile.clinic_id)
        .maybeSingle();
      treatmentType = (tr?.treatment_type as string | null | undefined) ?? null;
    }

    const snapshot: ConsentSnapshot = buildConsentSnapshot({
      templateKey: parsed.data.template_key,
      templateName: template.name,
      templateVersion: template.version,
      content,
      patient: { name: patient.name, phone: patient.phone, dob: patient.date_of_birth },
      treatmentType,
      clinic,
      // Dentist signature is only frozen at sign time.
      dentist: { name: profile.full_name, signatureUrl: null },
    });

    const { data: row, error } = await db
      .from("consents")
      .insert({
        clinic_id: profile.clinic_id,
        patient_id: patient.id,
        treatment_id: parsed.data.treatment_id ?? null,
        appointment_id: parsed.data.appointment_id ?? null,
        template_id: template.templateId,
        template_version_id: template.versionId,
        template_key: parsed.data.template_key,
        template_name: template.name,
        template_version: template.version,
        source: "digital",
        status: "draft",
        content_snapshot: snapshot,
        dentist_id: profile.id,
        created_by: profile.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select("*")
      .single();

    if (error || !row) {
      console.error("[createConsent] insert:", error);
      return { data: null, error: "Failed to create consent." };
    }

    await writeConsentAudit({
      consentId: row.id,
      clinicId: profile.clinic_id,
      action: "created",
      newValue: { template_key: parsed.data.template_key, status: "draft" },
      performedBy: profile.id,
    });

    revalidatePath(`/dentist/patients/${patient.id}`);
    if (parsed.data.treatment_id) revalidatePath(`/dentist/treatments/${parsed.data.treatment_id}`);
    return { data: row as Consent, error: null };
  } catch (err) {
    console.error("[createConsent] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// updateConsentDraft — dentist — edit an unsigned consent's content / status
// =============================================================================

export async function updateConsentDraft(
  id: string,
  input: unknown
): Promise<ActionResult<Consent>> {
  try {
    const parsed = UpdateConsentSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can edit consents." };
    }
    if (!(await isConsentFormsEnabled(db, profile.clinic_id))) {
      return { data: null, error: CONSENT_FORMS_DISABLED_MESSAGE };
    }

    const { data: existing } = await db
      .from("consents")
      .select("id, status, source, content_snapshot")
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return { data: null, error: "Consent not found." };
    if (existing.source !== "digital") {
      return { data: null, error: "Uploaded consents cannot be edited." };
    }
    if (!isConsentEditable(existing.status)) {
      return { data: null, error: "A signed or cancelled consent cannot be edited." };
    }

    const snapshot = existing.content_snapshot as ConsentSnapshot;
    const updates: Record<string, unknown> = {};

    if (parsed.data.section_edits && parsed.data.section_edits.length > 0) {
      const newContent = applyConsentEdits(snapshot.content, parsed.data.section_edits);
      updates.content_snapshot = { ...snapshot, content: newContent };
    }
    if (parsed.data.status) {
      updates.status = parsed.data.status;
    }
    if (Object.keys(updates).length === 0) {
      return { data: existing as Consent, error: null };
    }

    const { data: row, error } = await db
      .from("consents")
      .update(updates)
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .select("*")
      .single();

    if (error || !row) {
      console.error("[updateConsentDraft] update:", error);
      return { data: null, error: "Failed to update consent." };
    }

    await writeConsentAudit({
      consentId: id,
      clinicId: profile.clinic_id,
      action: parsed.data.status ? "status_changed" : "updated",
      oldValue: { status: existing.status },
      newValue: { status: row.status },
      performedBy: profile.id,
    });

    revalidatePath(`/dentist/patients/${row.patient_id}`);
    return { data: row as Consent, error: null };
  } catch (err) {
    console.error("[updateConsentDraft] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// signConsent — dentist — capture the patient signature and FREEZE the consent
// =============================================================================

export async function signConsent(id: string, input: unknown): Promise<ActionResult<Consent>> {
  try {
    const parsed = SignConsentSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can sign consents." };
    }
    if (!(await isConsentFormsEnabled(db, profile.clinic_id))) {
      return { data: null, error: CONSENT_FORMS_DISABLED_MESSAGE };
    }

    const { data: existing } = await db
      .from("consents")
      .select("id, status, source, content_snapshot, patient_id")
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return { data: null, error: "Consent not found." };
    if (!canSignConsent(existing.status, existing.source)) {
      return { data: null, error: "This consent cannot be signed." };
    }

    // Freeze the dentist's identity + signature into the snapshot at sign time.
    const { data: dentist } = await db
      .from("profiles")
      .select("full_name, signature_url")
      .eq("id", profile.id)
      .maybeSingle();

    const dentistName = (dentist?.full_name as string | null | undefined) ?? profile.full_name ?? null;
    const dentistSignatureUrl = (dentist?.signature_url as string | null | undefined) ?? null;

    const snapshot = existing.content_snapshot as ConsentSnapshot;
    const frozen: ConsentSnapshot = {
      ...snapshot,
      dentist: { name: dentistName, signatureUrl: dentistSignatureUrl },
      frozenAt: new Date().toISOString(),
    };

    const { data: row, error } = await db
      .from("consents")
      .update({
        status: "signed",
        signed_at: new Date().toISOString(),
        patient_signed_name: parsed.data.patient_signed_name,
        patient_signature: parsed.data.patient_signature,
        dentist_id: profile.id,
        dentist_signature_url: dentistSignatureUrl,
        content_snapshot: frozen,
      })
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .select("*")
      .single();

    if (error || !row) {
      console.error("[signConsent] update:", error);
      return { data: null, error: "Failed to sign consent." };
    }

    await writeConsentAudit({
      consentId: id,
      clinicId: profile.clinic_id,
      action: "signed",
      oldValue: { status: existing.status },
      newValue: { status: "signed", signed_by_patient_name: parsed.data.patient_signed_name },
      performedBy: profile.id,
    });

    revalidatePath(`/dentist/patients/${row.patient_id}`);
    return { data: row as Consent, error: null };
  } catch (err) {
    console.error("[signConsent] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// cancelConsent — dentist — mark an unsigned consent cancelled (terminal)
// =============================================================================

export async function cancelConsent(id: string): Promise<ActionResult<null>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can cancel consents." };
    }
    if (!(await isConsentFormsEnabled(db, profile.clinic_id))) {
      return { data: null, error: CONSENT_FORMS_DISABLED_MESSAGE };
    }

    const { data: existing } = await db
      .from("consents")
      .select("id, status, patient_id")
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return { data: null, error: "Consent not found." };
    if (!canCancelConsent(existing.status)) {
      return { data: null, error: "This consent cannot be cancelled." };
    }

    const { error } = await db
      .from("consents")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id);

    if (error) {
      console.error("[cancelConsent] update:", error);
      return { data: null, error: "Failed to cancel consent." };
    }

    await writeConsentAudit({
      consentId: id,
      clinicId: profile.clinic_id,
      action: "cancelled",
      oldValue: { status: existing.status },
      newValue: { status: "cancelled" },
      performedBy: profile.id,
    });

    revalidatePath(`/dentist/patients/${existing.patient_id}`);
    return { data: null, error: null };
  } catch (err) {
    console.error("[cancelConsent] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// uploadSignedConsent — dentist + receptionist — attach an externally-signed
// paper consent. Stored as source='uploaded', status='signed'. The original
// file is never modified; a replacement is a NEW consent record.
// =============================================================================

export async function uploadSignedConsent(formData: FormData): Promise<ActionResult<Consent>> {
  try {
    const file = formData.get("file");
    const meta = UploadConsentMetaSchema.safeParse({
      patient_id: formData.get("patient_id"),
      treatment_id: formData.get("treatment_id") ?? "",
      appointment_id: formData.get("appointment_id") ?? "",
      template_key: formData.get("template_key"),
    });
    if (!meta.success) {
      return { data: null, error: meta.error.errors[0]?.message ?? "Invalid input" };
    }
    if (!(file instanceof File)) {
      return { data: null, error: "No file provided." };
    }
    // Same rules the dialog applies, re-checked here — the client is never
    // trusted. Sharing one validator keeps the two from drifting apart.
    const invalid = validateConsentUpload(file);
    if (invalid) {
      return { data: null, error: invalid };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }
    if (!(await isConsentFormsEnabled(db, profile.clinic_id))) {
      return { data: null, error: CONSENT_FORMS_DISABLED_MESSAGE };
    }

    const patient = await fetchPatient(db, profile.clinic_id, meta.data.patient_id);
    if (!patient) return { data: null, error: "Patient not found." };

    await ensureConsentTemplates(profile.clinic_id, profile.id);
    const template = await loadTemplate(db, profile.clinic_id, meta.data.template_key);
    const clinic = await fetchClinicInfo(db, profile.clinic_id);

    let treatmentType: string | null = null;
    if (meta.data.treatment_id) {
      const { data: tr } = await db
        .from("treatments")
        .select("treatment_type")
        .eq("id", meta.data.treatment_id)
        .eq("clinic_id", profile.clinic_id)
        .maybeSingle();
      treatmentType = (tr?.treatment_type as string | null | undefined) ?? null;
    }

    const consentId = randomUUID();
    const path = consentObjectPath(profile.clinic_id, patient.id, consentId, file.name);

    // Upload the original file through the user-scoped client so storage RLS
    // (clinic-scoped staff insert) is exercised as defence in depth.
    const { error: uploadErr } = await db.storage
      .from(CONSENT_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadErr) {
      // Storage rejected the object (bucket missing, storage RLS, quota…).
      // Log the real fault; show the user something they can act on.
      console.error("[uploadSignedConsent] storage upload failed:", {
        bucket: CONSENT_BUCKET,
        path,
        clinicId: profile.clinic_id,
        error: uploadErr,
      });
      return { data: null, error: "Couldn't upload the consent form. Please try again." };
    }

    const snapshot: ConsentSnapshot = buildConsentSnapshot({
      templateKey: meta.data.template_key,
      templateName: template?.name ?? "Uploaded Signed Consent",
      templateVersion: template?.version ?? 1,
      content: template?.content ?? { sections: [], disclaimer: "" },
      patient: { name: patient.name, phone: patient.phone, dob: patient.date_of_birth },
      treatmentType,
      clinic,
      dentist: { name: null, signatureUrl: null },
    });

    // Insert the (already signed, immutable) record via the admin client: it is
    // written signed in a single insert so no post-insert update is needed, and
    // receptionists have no UPDATE policy. Authorization was verified above.
    const admin = createAdminClient();
    const { data: row, error } = await admin
      .from("consents")
      .insert({
        id: consentId,
        clinic_id: profile.clinic_id,
        patient_id: patient.id,
        treatment_id: meta.data.treatment_id ?? null,
        appointment_id: meta.data.appointment_id ?? null,
        template_id: template?.templateId ?? null,
        template_version_id: template?.versionId ?? null,
        template_key: meta.data.template_key,
        template_name: template?.name ?? "Uploaded Signed Consent",
        template_version: template?.version ?? 1,
        source: "uploaded",
        status: "signed",
        content_snapshot: snapshot,
        file_name: file.name,
        file_path: path,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: profile.id,
        uploaded_at: new Date().toISOString(),
        created_by: profile.id,
        signed_at: new Date().toISOString(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select("*")
      .single();

    if (error || !row) {
      // Distinct from the storage failure above: the FILE landed, but the
      // consent record did not. Roll the object back so a stored file never
      // outlives the record that gives it meaning.
      console.error("[uploadSignedConsent] consent record insert failed (file was uploaded):", {
        path,
        clinicId: profile.clinic_id,
        patientId: patient.id,
        error,
      });
      const { error: cleanupErr } = await db.storage.from(CONSENT_BUCKET).remove([path]);
      if (cleanupErr) {
        console.error("[uploadSignedConsent] orphaned file cleanup failed:", { path, error: cleanupErr });
      }
      return {
        data: null,
        error: "The file uploaded, but saving the consent record failed. Please try again.",
      };
    }

    await writeConsentAudit({
      consentId: row.id,
      clinicId: profile.clinic_id,
      action: "uploaded",
      newValue: { file_name: file.name, source: "uploaded", status: "signed" },
      performedBy: profile.id,
    });

    revalidatePath(`/dentist/patients/${patient.id}`);
    revalidatePath(`/receptionist/patients/${patient.id}`);
    return { data: row as Consent, error: null };
  } catch (err) {
    console.error("[uploadSignedConsent] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// Reads (staff)
// =============================================================================

export type ConsentListItem = {
  id: string;
  template_key: string;
  template_name: string;
  treatment_type: string | null;
  source: "digital" | "uploaded";
  status: "draft" | "ready_to_sign" | "signed" | "cancelled";
  treatment_id: string | null;
  appointment_id: string | null;
  signed_at: string | null;
  created_at: string;
  file_name: string | null;
};

function toListItem(row: Record<string, unknown>): ConsentListItem {
  const snap = row.content_snapshot as ConsentSnapshot | null;
  return {
    id: row.id as string,
    template_key: row.template_key as string,
    template_name: row.template_name as string,
    treatment_type: snap?.treatment?.type ?? null,
    source: row.source as "digital" | "uploaded",
    status: row.status as ConsentListItem["status"],
    treatment_id: (row.treatment_id as string | null) ?? null,
    appointment_id: (row.appointment_id as string | null) ?? null,
    signed_at: (row.signed_at as string | null) ?? null,
    created_at: row.created_at as string,
    file_name: (row.file_name as string | null) ?? null,
  };
}

export async function getConsentsForPatient(
  patientId: string
): Promise<ActionResult<ConsentListItem[]>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }
    if (!(await isConsentFormsEnabled(db, profile.clinic_id))) {
      return { data: null, error: CONSENT_FORMS_DISABLED_MESSAGE };
    }

    const { data, error } = await db
      .from("consents")
      .select(
        "id, template_key, template_name, source, status, treatment_id, appointment_id, signed_at, created_at, file_name, content_snapshot"
      )
      .eq("clinic_id", profile.clinic_id)
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getConsentsForPatient]", error);
      return { data: null, error: "Failed to load consents." };
    }
    return { data: (data ?? []).map(toListItem), error: null };
  } catch (err) {
    console.error("[getConsentsForPatient] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

export async function getConsentsForTreatment(
  treatmentId: string
): Promise<ActionResult<ConsentListItem[]>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }
    if (!(await isConsentFormsEnabled(db, profile.clinic_id))) {
      return { data: null, error: CONSENT_FORMS_DISABLED_MESSAGE };
    }

    const { data, error } = await db
      .from("consents")
      .select(
        "id, template_key, template_name, source, status, treatment_id, appointment_id, signed_at, created_at, file_name, content_snapshot"
      )
      .eq("clinic_id", profile.clinic_id)
      .eq("treatment_id", treatmentId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getConsentsForTreatment]", error);
      return { data: null, error: "Failed to load consents." };
    }
    return { data: (data ?? []).map(toListItem), error: null };
  } catch (err) {
    console.error("[getConsentsForTreatment] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

/** Full consent row for staff (dentist/receptionist), clinic-scoped. */
export async function getConsent(id: string): Promise<ActionResult<Consent>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }
    if (!(await isConsentFormsEnabled(db, profile.clinic_id))) {
      return { data: null, error: CONSENT_FORMS_DISABLED_MESSAGE };
    }

    const { data, error } = await db
      .from("consents")
      .select("*")
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("[getConsent]", error);
      return { data: null, error: "Failed to load consent." };
    }
    if (!data) return { data: null, error: "Consent not found." };
    return { data: data as Consent, error: null };
  } catch (err) {
    console.error("[getConsent] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

/** Short-lived signed URL for an uploaded consent's file (staff, clinic-scoped). */
export async function getConsentFileUrl(id: string): Promise<ActionResult<{ url: string }>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }
    if (!(await isConsentFormsEnabled(db, profile.clinic_id))) {
      return { data: null, error: CONSENT_FORMS_DISABLED_MESSAGE };
    }

    const { data: row } = await db
      .from("consents")
      .select("file_path")
      .eq("id", id)
      .eq("clinic_id", profile.clinic_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!row?.file_path) return { data: null, error: "No file for this consent." };

    const { data: signed, error } = await db.storage
      .from(CONSENT_BUCKET)
      .createSignedUrl(row.file_path, 60 * 60);

    if (error || !signed?.signedUrl) {
      console.error("[getConsentFileUrl]", error);
      return { data: null, error: "Failed to open the file." };
    }
    return { data: { url: signed.signedUrl }, error: null };
  } catch (err) {
    console.error("[getConsentFileUrl] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// Reads (patient portal) — patient_id resolved from the session, never client
// =============================================================================

export async function getPortalConsents(): Promise<ActionResult<ConsentListItem[]>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (!(await isConsentFormsEnabled(db, profile.clinic_id))) {
      return { data: null, error: CONSENT_FORMS_DISABLED_MESSAGE };
    }
    // Patients only; staff use the staff readers.
    const { data, error } = await db
      .from("patient_consents") // portal-safe view, RLS scopes to own signed
      .select(
        "id, template_key, template_name, source, status, treatment_id, appointment_id, signed_at, created_at, file_name, content_snapshot"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getPortalConsents]", error);
      return { data: null, error: "Failed to load consents." };
    }
    return { data: (data ?? []).map(toListItem), error: null };
  } catch (err) {
    console.error("[getPortalConsents] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

export async function getPortalConsentDetail(
  id: string
): Promise<ActionResult<{ snapshot: ConsentSnapshot; source: string; status: string; signed_at: string | null; patient_signature: string | null; patient_signed_name: string | null; file_name: string | null }>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (!(await isConsentFormsEnabled(db, profile.clinic_id))) {
      return { data: null, error: CONSENT_FORMS_DISABLED_MESSAGE };
    }

    const { data, error } = await db
      .from("patient_consents")
      .select(
        "id, source, status, signed_at, patient_signed_name, patient_signature, file_name, content_snapshot"
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[getPortalConsentDetail]", error);
      return { data: null, error: "Failed to load consent." };
    }
    if (!data) return { data: null, error: "Consent not found." };

    return {
      data: {
        snapshot: data.content_snapshot as ConsentSnapshot,
        source: data.source as string,
        status: data.status as string,
        signed_at: (data.signed_at as string | null) ?? null,
        // The patient's own signature — appropriate to show them on their own consent.
        patient_signature: (data.patient_signature as string | null) ?? null,
        patient_signed_name: (data.patient_signed_name as string | null) ?? null,
        file_name: (data.file_name as string | null) ?? null,
      },
      error: null,
    };
  } catch (err) {
    console.error("[getPortalConsentDetail] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

export async function getPortalConsentFileUrl(id: string): Promise<ActionResult<{ url: string }>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (!(await isConsentFormsEnabled(db, profile.clinic_id))) {
      return { data: null, error: CONSENT_FORMS_DISABLED_MESSAGE };
    }

    // Confirm the consent is the caller's own signed consent via the portal view.
    const { data: row } = await db
      .from("patient_consents")
      .select("id, file_name")
      .eq("id", id)
      .maybeSingle();
    if (!row) return { data: null, error: "Consent not found." };

    // Resolve the storage path from the base row is not visible to the patient;
    // instead re-fetch file_path via the portal-scoped storage policy using the
    // known object listing. We stored file_path only on the base table, so we
    // resolve it through the admin client scoped by the already-authorized id.
    const admin = createAdminClient();
    const { data: base } = await admin
      .from("consents")
      .select("file_path, patient_id")
      .eq("id", id)
      .maybeSingle();
    if (!base?.file_path) return { data: null, error: "No file for this consent." };

    const { data: signed, error } = await db.storage
      .from(CONSENT_BUCKET)
      .createSignedUrl(base.file_path as string, 60 * 60);

    if (error || !signed?.signedUrl) {
      console.error("[getPortalConsentFileUrl]", error);
      return { data: null, error: "Failed to open the file." };
    }
    return { data: { url: signed.signedUrl }, error: null };
  } catch (err) {
    console.error("[getPortalConsentFileUrl] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
