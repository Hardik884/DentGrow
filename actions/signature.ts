"use server";

import { revalidatePath } from "next/cache";
import { resolveSession as resolveCachedSession } from "@/lib/auth/session";
import {
  SIGNATURE_BUCKET,
  ALLOWED_SIGNATURE_TYPES,
  MAX_SIGNATURE_SIZE,
  signatureObjectPath,
} from "@/lib/signatures/constants";
import { resolveSignatureUrl } from "@/lib/signatures/resolve";
import {
  actualContentType,
  assertImageContentMatches,
} from "@/lib/security/file-validation";
import type { ActionResult } from "@/types";

/**
 * Dentist Digital Signature — Server Actions
 *
 * A dentist uploads their signature ONCE. It is stored in the PRIVATE
 * dentist-signatures bucket and referenced by object PATH from
 * profiles.signature_url; a short-lived signed URL is minted at render time
 * (lib/signatures/resolve.ts). The bucket was public until 20260903000400 —
 * a permanent world-readable URL for the mark that authenticates a
 * prescription. Rows written before that still hold an absolute URL and the
 * resolver handles both.
 * It is then resolved automatically onto every completed treatment shown to
 * patients — the dentist never signs individual treatments.
 *
 * Security rules (enforced in every action):
 * - clinic_id and dentist_id (= auth.uid()) are ALWAYS sourced from the server
 *   session. Client-supplied values are ignored.
 * - Only the `dentist` role may upload / replace / delete a signature.
 * - The storage object path is owner-scoped: {clinic_id}/{dentist_id}/signature.png
 *   and Storage RLS independently enforces clinic + dentist ownership, so no
 *   dentist can ever modify another dentist's signature.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

type ResolvedProfile = {
  id: string;
  clinic_id: string;
  role: "dentist" | "receptionist" | "patient";
};

async function resolveSession(): Promise<{
  db: DbClient;
  profile: ResolvedProfile | null;
}> {
  const { db, profile } = await resolveCachedSession();
  return { db, profile };
}

// =============================================================================
// getMySignature — returns the logged-in dentist's current signature URL
// =============================================================================

export async function getMySignature(): Promise<ActionResult<{ url: string | null }>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists have signatures." };
    }

    const { data, error } = await db
      .from("profiles")
      .select("signature_url")
      .eq("id", profile.id)
      .single();

    if (error) {
      console.error("[getMySignature]", error);
      return { data: null, error: "Failed to load signature." };
    }

    const url = await resolveSignatureUrl(db, data?.signature_url as string | null);
    return { data: { url }, error: null };
  } catch (err) {
    console.error("[getMySignature] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// uploadSignature — dentist only — uploads (or replaces) their signature
//
// Accepts FormData: { file }. The file is uploaded to the dentist-signatures
// bucket at the deterministic owner-scoped path and profiles.signature_url is
// updated with the public URL (cache-busted so replacements render immediately).
// =============================================================================

export async function uploadSignature(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  try {
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return { data: null, error: "No file provided." };
    }

    if (!ALLOWED_SIGNATURE_TYPES.includes(file.type as (typeof ALLOWED_SIGNATURE_TYPES)[number])) {
      return { data: null, error: "Unsupported file type. Allowed: PNG, JPG." };
    }

    if (file.size > MAX_SIGNATURE_SIZE) {
      return { data: null, error: "File too large (max 4 MB)." };
    }

    // file.type is whatever the browser said. Read the first bytes and check
    // they are actually a PNG or JPEG — see lib/security/file-validation.ts.
    const contentError = await assertImageContentMatches(file);
    if (contentError) return { data: null, error: contentError };

    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can upload a signature." };
    }

    const path = signatureObjectPath(profile.clinic_id, profile.id);

    // upsert overwrites any existing signature at the same owner-scoped path,
    // so replacing never leaves an orphaned object.
    const { error: uploadErr } = await db.storage
      .from(SIGNATURE_BUCKET)
      .upload(path, file, { contentType: await actualContentType(file), upsert: true });

    if (uploadErr) {
      console.error("[uploadSignature] upload:", uploadErr);
      return { data: null, error: "Failed to upload signature." };
    }

    // Store the object PATH, not a URL. The bucket is private, so there is no
    // stable URL to store — and a stored URL is exactly what leaked before.
    // No cache-buster is needed either: every signed URL is freshly minted.
    const { error: updateErr } = await db
      .from("profiles")
      .update({ signature_url: path, updated_at: new Date().toISOString() })
      .eq("id", profile.id);

    if (updateErr) {
      console.error("[uploadSignature] profile update:", updateErr);
      return { data: null, error: "Failed to save signature." };
    }

    revalidatePath("/dentist/settings");

    const url = await resolveSignatureUrl(db, path);
    if (!url) {
      // The object is stored and the profile points at it; only the preview
      // link failed. Say so rather than reporting a failed upload.
      return { data: null, error: "Signature saved, but the preview could not be loaded." };
    }

    return { data: { url }, error: null };
  } catch (err) {
    console.error("[uploadSignature] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}

// =============================================================================
// deleteSignature — dentist only — removes the storage object + clears the URL
// =============================================================================

export async function deleteSignature(): Promise<ActionResult<null>> {
  try {
    const { db, profile } = await resolveSession();
    if (!profile) return { data: null, error: "Unauthorized" };
    if (profile.role !== "dentist") {
      return { data: null, error: "Forbidden: only dentists can delete a signature." };
    }

    const path = signatureObjectPath(profile.clinic_id, profile.id);

    // Best-effort removal of the storage object, then clear the reference.
    const { error: removeErr } = await db.storage.from(SIGNATURE_BUCKET).remove([path]);
    if (removeErr) {
      console.error("[deleteSignature] remove:", removeErr);
      // Continue — we still want to clear the DB reference so the UI is consistent.
    }

    const { error: updateErr } = await db
      .from("profiles")
      .update({ signature_url: null, updated_at: new Date().toISOString() })
      .eq("id", profile.id);

    if (updateErr) {
      console.error("[deleteSignature] profile update:", updateErr);
      return { data: null, error: "Failed to delete signature." };
    }

    revalidatePath("/dentist/settings");

    return { data: null, error: null };
  } catch (err) {
    console.error("[deleteSignature] unexpected:", err);
    return { data: null, error: "Unexpected error" };
  }
}
