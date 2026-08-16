"use server";

import { revalidatePath } from "next/cache";
import { resolveSession as resolveCachedSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_CONSENT_TEMPLATES,
  DEFAULT_TEMPLATE_BY_KEY,
  selectTemplateKeyForTreatmentType,
  type ConsentTemplateKey,
} from "@/lib/consents/templates";
import type { ConsentContent } from "@/lib/consents/content";
import { isConsentFormsEnabled, CONSENT_FORMS_DISABLED_MESSAGE } from "@/lib/consents/flag";
import { UpdateConsentTemplateSchema, type ActionResult } from "@/types";

/**
 * Consent Templates — Server Actions
 *
 * A clinic's consent templates are provisioned once from the code defaults
 * (lib/consents/templates.ts) and are thereafter clinic-owned and versioned.
 * Editing a template creates a NEW immutable version; signed consents keep the
 * exact version they were built from, so master edits never rewrite history.
 *
 * Authorization:
 *   - dentist: manage (list, read, edit -> new version).
 *   - receptionist: list/read only (to pick a consent type when uploading).
 *   - clinic_id/role are always sourced from the server session.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;
type ResolvedProfile = {
  id: string;
  clinic_id: string;
  role: "dentist" | "receptionist" | "patient";
};

async function resolveSession(): Promise<{ db: DbClient; profile: ResolvedProfile | null }> {
  const { db, profile } = await resolveCachedSession();
  return { db, profile };
}

export type ClinicConsentTemplate = {
  id: string;
  template_key: string;
  name: string;
  treatment_keywords: string[];
  consent_required: boolean;
  consent_recommended: boolean;
  is_active: boolean;
  current_version: number;
  updated_at: string;
};

export type ConsentTemplateWithContent = ClinicConsentTemplate & {
  version_id: string;
  content: ConsentContent;
};

/**
 * ensureConsentTemplates — idempotently provision the 8 default templates (and
 * their v1 content) for the given clinic if they don't already exist.
 *
 * Uses the admin client so it works regardless of the caller's role (a
 * receptionist opening the upload dialog can trigger provisioning too), while
 * clinic_id is always the caller's server-session clinic. Safe to call on every
 * relevant page load — it only inserts what's missing.
 */
export async function ensureConsentTemplates(clinicId: string, createdBy: string | null): Promise<void> {
  const admin = createAdminClient();

  const { data: existing, error } = await admin
    .from("consent_templates")
    .select("template_key")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq("clinic_id", clinicId as any);

  if (error) {
    console.error("[ensureConsentTemplates] list:", error);
    return;
  }

  const have = new Set((existing ?? []).map((r: { template_key: string }) => r.template_key));
  const missing = DEFAULT_CONSENT_TEMPLATES.filter((t) => !have.has(t.key));
  if (missing.length === 0) return;

  for (const def of missing) {
    const { data: inserted, error: tErr } = await admin
      .from("consent_templates")
      .insert({
        clinic_id: clinicId,
        template_key: def.key,
        name: def.name,
        treatment_keywords: def.treatmentKeywords,
        consent_required: def.consentRequired,
        consent_recommended: def.consentRecommended,
        is_active: true,
        current_version: 1,
        created_by: createdBy,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select("id")
      .single();

    if (tErr || !inserted) {
      // Unique-violation just means a concurrent provision won the race — skip.
      if (tErr && tErr.code !== "23505") console.error("[ensureConsentTemplates] insert template:", tErr);
      continue;
    }

    const { error: vErr } = await admin.from("consent_template_versions").insert({
      template_id: (inserted as { id: string }).id,
      clinic_id: clinicId,
      version: 1,
      content: def.content,
      created_by: createdBy,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    if (vErr) console.error("[ensureConsentTemplates] insert version:", vErr);
  }
}

/** List the clinic's consent templates (provisioning defaults first). */
export async function getConsentTemplates(): Promise<ActionResult<ClinicConsentTemplate[]>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }
    if (!(await isConsentFormsEnabled(db, profile.clinic_id))) {
      return { data: null, error: CONSENT_FORMS_DISABLED_MESSAGE };
    }

    await ensureConsentTemplates(profile.clinic_id, profile.id);

    const { data, error } = await db
      .from("consent_templates")
      .select(
        "id, template_key, name, treatment_keywords, consent_required, consent_recommended, is_active, current_version, updated_at"
      )
      .eq("clinic_id", profile.clinic_id)
      .order("name", { ascending: true });

    if (error) {
      console.error("[getConsentTemplates]", error);
      return { data: null, error: "Failed to load templates." };
    }
    return { data: (data ?? []) as ClinicConsentTemplate[], error: null };
  } catch (err) {
    console.error("[getConsentTemplates] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

/**
 * Resolve a single template + its current-version content, selected either by
 * an explicit key or auto-selected from a treatment type. Provisions defaults
 * first, so a clinic that has never touched templates still resolves one.
 */
export async function getConsentTemplateContent(params: {
  templateKey?: string;
  treatmentType?: string | null;
}): Promise<ActionResult<ConsentTemplateWithContent>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist" && profile.role !== "receptionist") {
      return { data: null, error: "Forbidden" };
    }
    if (!(await isConsentFormsEnabled(db, profile.clinic_id))) {
      return { data: null, error: CONSENT_FORMS_DISABLED_MESSAGE };
    }

    await ensureConsentTemplates(profile.clinic_id, profile.id);

    const key: ConsentTemplateKey =
      (params.templateKey as ConsentTemplateKey) ||
      selectTemplateKeyForTreatmentType(params.treatmentType);
    const safeKey = DEFAULT_TEMPLATE_BY_KEY[key] ? key : "general";

    const { data: tmpl, error: tErr } = await db
      .from("consent_templates")
      .select(
        "id, template_key, name, treatment_keywords, consent_required, consent_recommended, is_active, current_version, updated_at"
      )
      .eq("clinic_id", profile.clinic_id)
      .eq("template_key", safeKey)
      .single();

    if (tErr || !tmpl) {
      console.error("[getConsentTemplateContent] template:", tErr);
      return { data: null, error: "Template not found." };
    }

    const { data: ver, error: vErr } = await db
      .from("consent_template_versions")
      .select("id, content")
      .eq("template_id", tmpl.id)
      .eq("version", tmpl.current_version)
      .single();

    if (vErr || !ver) {
      console.error("[getConsentTemplateContent] version:", vErr);
      return { data: null, error: "Template content not found." };
    }

    return {
      data: {
        ...(tmpl as ClinicConsentTemplate),
        version_id: ver.id as string,
        content: ver.content as ConsentContent,
      },
      error: null,
    };
  } catch (err) {
    console.error("[getConsentTemplateContent] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

/**
 * Update a master template. Metadata fields are updated in place; when `content`
 * is supplied a NEW immutable version is created and current_version is bumped.
 * Dentist only. Never affects historical signed consents.
 */
export async function updateConsentTemplate(
  input: unknown
): Promise<ActionResult<{ id: string; current_version: number }>> {
  try {
    const parsed = UpdateConsentTemplateSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can edit consent templates." };
    }
    if (!(await isConsentFormsEnabled(db, profile.clinic_id))) {
      return { data: null, error: CONSENT_FORMS_DISABLED_MESSAGE };
    }

    const { data: tmpl, error: tErr } = await db
      .from("consent_templates")
      .select("id, current_version")
      .eq("id", parsed.data.template_id)
      .eq("clinic_id", profile.clinic_id)
      .single();

    if (tErr || !tmpl) return { data: null, error: "Template not found." };

    let nextVersion = tmpl.current_version as number;

    if (parsed.data.content) {
      nextVersion = (tmpl.current_version as number) + 1;
      const { error: vErr } = await db.from("consent_template_versions").insert({
        template_id: tmpl.id,
        clinic_id: profile.clinic_id,
        version: nextVersion,
        content: parsed.data.content,
        created_by: profile.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      if (vErr) {
        console.error("[updateConsentTemplate] version:", vErr);
        return { data: null, error: "Failed to save new template version." };
      }
    }

    const updates: Record<string, unknown> = { current_version: nextVersion };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.consent_required !== undefined) updates.consent_required = parsed.data.consent_required;
    if (parsed.data.consent_recommended !== undefined) updates.consent_recommended = parsed.data.consent_recommended;
    if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;

    const { error: uErr } = await db
      .from("consent_templates")
      .update(updates)
      .eq("id", tmpl.id)
      .eq("clinic_id", profile.clinic_id);

    if (uErr) {
      console.error("[updateConsentTemplate] update:", uErr);
      return { data: null, error: "Failed to update template." };
    }

    revalidatePath("/dentist/settings/consent-templates");
    return { data: { id: tmpl.id as string, current_version: nextVersion }, error: null };
  } catch (err) {
    console.error("[updateConsentTemplate] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
