/**
 * lib/security/file-validation.ts
 *
 * Deciding whether an uploaded file is what it says it is.
 *
 * THE PROBLEM WITH file.type
 *   Every upload path in OraMedha checked `file.type` against an allow-list of
 *   PDF/JPEG/PNG. `file.type` is the browser's guess, derived from the file
 *   extension, and it travels in the multipart headers — so it is entirely
 *   under the caller's control. A file of any content at all could be uploaded
 *   as "image/png" simply by naming it .png, and would then be stored in the
 *   patient-documents bucket and served back to a clinician's browser with that
 *   Content-Type.
 *
 *   The realistic consequence is not dramatic: the buckets are private, the
 *   objects are served with the stored Content-Type, and the app now sets
 *   X-Content-Type-Options: nosniff, so a mislabelled file will not be executed
 *   as script. But "we store whatever bytes you send under whatever type you
 *   claim" is not a property a clinical document store should have, and
 *   checking is cheap.
 *
 * WHAT THIS DOES
 *   Reads the first few bytes and compares them against the format's actual
 *   magic number. That is a real check — those bytes are structural, not
 *   metadata — and it is the check that catches the whole class of "this is not
 *   a PNG" without pretending to be more.
 *
 * WHAT THIS IS NOT
 *   It is not malware scanning. A genuine, well-formed JPEG can still carry a
 *   malicious payload for a vulnerable decoder, and no amount of header
 *   inspection finds that. The seam for real scanning is `scanUpload` at the
 *   bottom of this file: it is a no-op today and says so, so that adding a
 *   scanner later is one implementation rather than an audit of every upload
 *   path.
 */

/** Formats the product accepts, and the bytes that actually identify them. */
type Signature = {
  mime: readonly string[];
  /** Byte prefix. `null` entries match any byte (used for the RIFF/WEBP gap). */
  magic: ReadonlyArray<number | null>;
  label: string;
};

const SIGNATURES: readonly Signature[] = [
  {
    // %PDF-
    mime: ["application/pdf"],
    magic: [0x25, 0x50, 0x44, 0x46, 0x2d],
    label: "PDF",
  },
  {
    // \x89PNG\r\n\x1a\n — the full 8-byte header, including the CRLF trap that
    // detects a file mangled by a text-mode transfer.
    mime: ["image/png"],
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    label: "PNG",
  },
  {
    // JPEG SOI marker. The third byte varies by encoder (0xE0 JFIF, 0xE1 Exif,
    // 0xDB raw quantisation table, …), so only the two-byte SOI is fixed.
    mime: ["image/jpeg", "image/jpg"],
    magic: [0xff, 0xd8, 0xff],
    label: "JPEG",
  },
];

/** How many bytes need reading to decide. The longest signature above is 8. */
const HEADER_BYTES = 16;

function matches(header: Uint8Array, magic: ReadonlyArray<number | null>): boolean {
  if (header.length < magic.length) return false;
  return magic.every((byte, i) => byte === null || header[i] === byte);
}

/**
 * Identifies a file's real format from its leading bytes.
 * Returns the signature it matched, or null if it matched none.
 */
export function detectFormat(header: Uint8Array): Signature | null {
  return SIGNATURES.find((sig) => matches(header, sig.magic)) ?? null;
}

/**
 * Reads just the header of a File without pulling the whole thing into memory.
 * A 10 MB radiograph does not need to be buffered to check eight bytes.
 */
async function readHeader(file: File): Promise<Uint8Array> {
  const slice = file.slice(0, HEADER_BYTES);
  return new Uint8Array(await slice.arrayBuffer());
}

/**
 * Checks that a file's CONTENT matches the type it claims.
 *
 * Returns a user-facing message on rejection, or null when the file is
 * acceptable — the same shape as validateConsentUpload, so upload actions read
 * the same way whichever check they call.
 *
 * Deliberately permissive in one direction: a file whose real format is on the
 * allow-list but whose claimed type is a DIFFERENT allowed type (a JPEG named
 * .png) is accepted, and the real format is what gets recorded. That is a
 * mislabelled file, not an attack, and rejecting it would fail honest uploads
 * from phone cameras and scanners for no security gain.
 */
export async function assertContentMatchesType(
  file: File,
  allowed: readonly string[]
): Promise<string | null> {
  if (file.size === 0) return "That file is empty.";

  const header = await readHeader(file);
  const format = detectFormat(header);

  if (!format) {
    return "That file does not look like a PDF, JPG or PNG. Please check the file and try again.";
  }

  // Is the file's REAL format one this upload path accepts?
  const permitted = format.mime.some((m) => allowed.includes(m));
  if (!permitted) {
    return `That file is a ${format.label}, which is not accepted here.`;
  }

  return null;
}

/** Images only — for the signature upload, which does not accept PDFs. */
export async function assertImageContentMatches(file: File): Promise<string | null> {
  return assertContentMatchesType(file, ["image/png", "image/jpeg", "image/jpg"]);
}

/**
 * Returns the file's real media type, for storing alongside the object instead
 * of the browser's claim. Falls back to the claimed type when the format was
 * not recognised — callers reject those separately, so this is only reached for
 * a file that already passed.
 */
export async function actualContentType(file: File): Promise<string> {
  const format = detectFormat(await readHeader(file));
  return format?.mime[0] ?? file.type;
}

// =============================================================================
// The seam for content scanning
// =============================================================================

export type ScanVerdict =
  | { status: "clean" }
  | { status: "rejected"; reason: string }
  /** No scanner is configured. Distinct from "clean" on purpose. */
  | { status: "not-scanned" };

/**
 * Where malware scanning would go.
 *
 * It returns "not-scanned" rather than "clean", and that distinction is the
 * whole reason this function exists in this state. A stub that returned "clean"
 * would let a caller — or a later reader of the code — believe uploads are
 * scanned when nothing is scanning them, and that belief is more dangerous than
 * the absent scanner.
 *
 * Standing up a scanning service (ClamAV, a cloud AV API, an object-storage
 * hook) is not in scope here and would be infrastructure OraMedha does not run.
 * When it is, this is the one place that changes, and every upload path picks
 * it up.
 *
 * → REQUIRES MANUAL CONFIGURATION / INFRASTRUCTURE. See docs/SECURITY.md.
 */
export async function scanUpload(file: File): Promise<ScanVerdict> {
  void file;
  return { status: "not-scanned" };
}
