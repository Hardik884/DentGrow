import "server-only";
import { SIGNATURE_BUCKET } from "./constants";

/**
 * lib/signatures/resolve.ts
 *
 * Turns whatever `profiles.signature_url` holds into a URL that renders.
 *
 * WHY THIS IS NOT JUST createSignedUrl(path)
 *   The column has held two different things over the bucket's life:
 *
 *     - an absolute PUBLIC URL, written while the bucket was public
 *       (20260629000000), often with a `?v=` cache-buster appended;
 *     - an object PATH, written since the bucket became private
 *       (20260903000400).
 *
 *   Rewriting the old rows in a migration would have meant a window where a
 *   half-migrated clinic's prescriptions rendered without a signature, for no
 *   gain: recognising a stored public URL and extracting the path from it is
 *   three lines and needs no data migration at all. `signatureObjectPath` is
 *   deterministic, so the extracted path is always the same one a fresh upload
 *   would produce.
 *
 * WHY THE TTL IS LONGER THAN A DOCUMENT'S
 *   DOCUMENT_URL_TTL_SECONDS is five minutes because a leaked radiograph link
 *   is patient data in someone else's hands. A signature is not patient data,
 *   and it is rendered into things people keep open and then print: an invoice,
 *   a prescription, a consent document rendered to PDF client-side by
 *   html2canvas. A five-minute URL would produce blank signatures on a document
 *   printed ten minutes after the page loaded — a bug that would look like a
 *   rendering fault and be diagnosed as one.
 *
 *   An hour is still a decisive improvement over a permanent public URL, which
 *   is what this replaces.
 */

/** Lifetime of a signed signature URL. See the note above on why it differs. */
export const SIGNATURE_URL_TTL_SECONDS = 3600;

/**
 * Extracts the storage object path from a stored value.
 *
 * Accepts either a bare path ("<clinic>/<dentist>/signature.png") or an
 * absolute Supabase public URL containing
 * `/storage/v1/object/public/dentist-signatures/<path>`, with or without a
 * query string. Returns null for anything it does not recognise, so a corrupt
 * value produces a missing signature rather than a signed URL pointing at
 * something unexpected.
 */
export function signatureObjectPathFrom(stored: string | null | undefined): string | null {
  if (!stored) return null;

  const trimmed = stored.trim();
  if (trimmed.length === 0) return null;

  if (!/^https?:\/\//i.test(trimmed)) {
    // Already a path. Strip any cache-buster and reject traversal.
    const path = trimmed.split("?")[0];
    return path.includes("..") ? null : path;
  }

  try {
    const url = new URL(trimmed);
    const marker = `/storage/v1/object/public/${SIGNATURE_BUCKET}/`;
    const index = url.pathname.indexOf(marker);
    if (index === -1) return null;

    const path = decodeURIComponent(url.pathname.slice(index + marker.length));
    return path.length > 0 && !path.includes("..") ? path : null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StorageClient = any;

/**
 * Mints a short-lived signed URL for a stored signature reference.
 *
 * Returns null when there is no signature, when the stored value is
 * unrecognisable, or when signing fails — every caller renders "no signature"
 * for null already, so a failure degrades to a missing image rather than a
 * broken prescription.
 */
export async function resolveSignatureUrl(
  db: StorageClient,
  stored: string | null | undefined
): Promise<string | null> {
  const path = signatureObjectPathFrom(stored);
  if (!path) return null;

  try {
    const { data, error } = await db.storage
      .from(SIGNATURE_BUCKET)
      .createSignedUrl(path, SIGNATURE_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) return null;
    return data.signedUrl as string;
  } catch {
    return null;
  }
}

/**
 * Signs several stored references at once, de-duplicating by stored value.
 *
 * A prescriptions page lists many treatments by the same two or three dentists;
 * signing per row would issue the same URL twenty times and wait on twenty
 * round trips.
 */
export async function resolveSignatureUrls(
  db: StorageClient,
  stored: ReadonlyArray<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = [...new Set(stored.filter((s): s is string => !!s))];

  const entries = await Promise.all(
    unique.map(async (value) => [value, await resolveSignatureUrl(db, value)] as const)
  );

  return new Map(
    entries.filter((e): e is readonly [string, string] => e[1] !== null)
  );
}
