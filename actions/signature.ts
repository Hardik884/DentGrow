"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import {
  SIGNATURE_BUCKET,
  ALLOWED_SIGNATURE_TYPES,
  MAX_SIGNATURE_SIZE,
  signatureObjectPath,
} from "@/lib/signatures/constants";
import type { ActionResult } from "@/types";

/**
 * Dentist Digital Signature — Server Actions
 *
 * A dentist uploads their signature ONCE. It is stored securely in the
 * dentist-signatures bucket and referenced (URL only) from profiles.signature_url.
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
  const supabase = await createServerClient();
  const db: DbClient = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { db, profile: null };

  const { data } = await db
    .from("profiles")
    .select("id, clinic_id, role")
    .eq("id", user.id)
    .single();

  return { db, profile: (data as ResolvedProfile | null) ?? null };
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

    return { data: { url: (data?.signature_url as string | null) ?? null }, error: null };
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
      .upload(path, file, { contentType: file.type, upsert: true });

    if (uploadErr) {
      console.error("[uploadSignature] upload:", uploadErr);
      return { data: null, error: "Failed to upload signature." };
    }

    // Public bucket → stable public URL. Append a cache-buster so a replaced
    // signature (same path) is not served stale from the browser/CDN cache.
    const { data: pub } = db.storage.from(SIGNATURE_BUCKET).getPublicUrl(path);
    const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

    const { error: updateErr } = await db
      .from("profiles")
      .update({ signature_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", profile.id);

    if (updateErr) {
      console.error("[uploadSignature] profile update:", updateErr);
      return { data: null, error: "Failed to save signature." };
    }

    revalidatePath("/dentist/settings");

    return { data: { url: publicUrl }, error: null };
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
