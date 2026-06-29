/**
 * Dentist-signature constants shared across the codebase.
 * Lives outside actions/signature.ts because "use server" files
 * may only export async functions.
 */

/** Supabase storage bucket name for dentist signatures (public read). */
export const SIGNATURE_BUCKET = "dentist-signatures";

/** Allowed signature upload mime types — PNG, JPG, JPEG. */
export const ALLOWED_SIGNATURE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
] as const;

/** Maximum signature file size: 4 MB. */
export const MAX_SIGNATURE_SIZE = 4 * 1024 * 1024;

/**
 * Canonical object path for a dentist's signature.
 * Layout: {clinic_id}/{dentist_id}/signature.png
 *
 * A single, deterministic path per dentist means replacing a signature simply
 * overwrites the existing object (upsert) — never leaving orphaned files — and
 * deletion targets exactly one object. The .png extension is fixed; the real
 * media type is carried by the object's Content-Type, which browsers honour.
 */
export function signatureObjectPath(clinicId: string, dentistId: string): string {
  return `${clinicId}/${dentistId}/signature.png`;
}
