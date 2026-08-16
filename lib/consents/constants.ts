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

/**
 * Maximum uploaded consent file size.
 *
 * This is bounded by the transport, not by storage: the file is sent to a
 * Server Action as multipart FormData, so it must fit inside BOTH
 * `experimental.serverActions.bodySizeLimit` (next.config.ts) and the hosting
 * platform's own request-body cap (~4.5 MB on Vercel serverless functions),
 * with headroom for multipart framing and the metadata fields sent alongside.
 *
 * It previously read 15 MB, which no request could ever actually deliver —
 * anything over Next's 1 MB default was rejected during body parsing, before
 * this limit was ever consulted. Raising it again without raising both caps
 * above re-introduces that crash; `constants.spec.ts` guards the relationship.
 */
export const MAX_CONSENT_UPLOAD_SIZE = 4 * 1024 * 1024;

/** Human-readable form of MAX_CONSENT_UPLOAD_SIZE, for UI copy and messages. */
export const MAX_CONSENT_UPLOAD_SIZE_LABEL = "4 MB";

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

/** Bytes rendered as MB with one decimal, for user-facing size messages. */
function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validate a chosen consent file — the SINGLE definition of "is this file
 * acceptable", used by both the upload dialog (before the request is sent) and
 * `uploadSignedConsent` (which never trusts the client).
 *
 * Returns a user-facing message describing the problem, or null when the file
 * is acceptable. Checking client-side matters beyond convenience: an oversized
 * file that reaches the network is rejected during body parsing, which produces
 * a transport failure rather than a normal action error.
 */
export function validateConsentUpload(file: {
  type: string;
  size: number;
}): string | null {
  if (!ALLOWED_CONSENT_UPLOAD_TYPES.includes(file.type as AllowedConsentUploadType)) {
    return "Unsupported file type. Please choose a PDF, JPG or PNG.";
  }
  if (file.size > MAX_CONSENT_UPLOAD_SIZE) {
    return `That file is too large (${formatMb(file.size)}). Maximum size is ${MAX_CONSENT_UPLOAD_SIZE_LABEL}.`;
  }
  if (file.size === 0) {
    return "That file is empty. Please choose the signed document.";
  }
  return null;
}
