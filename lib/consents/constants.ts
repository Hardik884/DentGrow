/**
 * lib/consents/constants.ts
 *
 * Consent-feature constants shared across the codebase. Lives outside the
 * "use server" action files because those may only export async functions.
 */

/** Private Supabase storage bucket for uploaded, patient-signed consent files. */
export const CONSENT_BUCKET = "consent-documents";

/** Allowed upload mime types for an externally-signed consent — PDF, JPG, PNG. */
export const ALLOWED_CONSENT_UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
] as const;

export type AllowedConsentUploadType = (typeof ALLOWED_CONSENT_UPLOAD_TYPES)[number];

/** Maximum uploaded consent file size: 15 MB (scans/photos can be large). */
export const MAX_CONSENT_UPLOAD_SIZE = 15 * 1024 * 1024;

/**
 * Canonical storage object path for a consent's uploaded file.
 * Layout: {clinic_id}/{patient_id}/{consent_id}/{timestamp}-{safeName}
 *
 * The first two path segments (clinic_id, patient_id) are what the storage RLS
 * policies key on — clinic isolation on segment 1, patient-portal ownership on
 * segment 2 — exactly like the patient-documents bucket.
 */
export function consentObjectPath(
  clinicId: string,
  patientId: string,
  consentId: string,
  fileName: string
): string {
  const safeName = fileName.replace(/[^\w.\-]/g, "_");
  return `${clinicId}/${patientId}/${consentId}/${Date.now()}-${safeName}`;
}

/** Is this mime type an image (for choosing an <img> vs a PDF link when viewing)? */
export function isImageMime(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("image/");
}
