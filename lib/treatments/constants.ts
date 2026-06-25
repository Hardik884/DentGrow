/**
 * Treatment-related constants shared across the codebase.
 * Lives outside actions/treatments.ts because "use server" files
 * may only export async functions.
 */

/** Supabase storage bucket name for patient documents. */
export const DOCUMENT_BUCKET = "patient-documents";

/** Allowed upload mime types — PDF, JPG, JPEG, PNG. */
export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
] as const;
