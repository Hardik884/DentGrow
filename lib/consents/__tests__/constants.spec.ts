/**
 * lib/consents/__tests__/constants.spec.ts
 *
 * Guards the consent upload limits and the shared file validator.
 *
 * The regression this exists for: `MAX_CONSENT_UPLOAD_SIZE` advertised 15 MB
 * while `experimental.serverActions.bodySizeLimit` was left at Next's 1 MB
 * default. Anything between those two numbers was refused while the request
 * body was parsed — before the Server Action ran — so the action's own size
 * check never fired and the browser got an error page instead of an RSC
 * response, surfacing as "a client-side exception has occurred".
 *
 * The final test reads next.config.ts and fails if that gap ever reopens.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALLOWED_CONSENT_UPLOAD_TYPES,
  MAX_CONSENT_UPLOAD_SIZE,
  MAX_CONSENT_UPLOAD_SIZE_LABEL,
  consentObjectPath,
  isImageMime,
  validateConsentUpload,
} from "@/lib/consents/constants";

const MB = 1024 * 1024;

describe("validateConsentUpload — accepted files", () => {
  it.each([
    ["application/pdf", "a scanned PDF"],
    ["image/jpeg", "a JPG photo"],
    ["image/jpg", "a JPG photo (alternate mime)"],
    ["image/png", "a PNG scan"],
  ])("accepts %s (%s)", (type) => {
    expect(validateConsentUpload({ type, size: 512 * 1024 })).toBeNull();
  });

  it("accepts a file exactly at the limit", () => {
    expect(validateConsentUpload({ type: "application/pdf", size: MAX_CONSENT_UPLOAD_SIZE })).toBeNull();
  });
});

describe("validateConsentUpload — rejected files", () => {
  it.each([
    ["application/msword", "a Word document"],
    ["image/gif", "a GIF"],
    ["text/html", "an HTML file"],
    ["application/zip", "an archive"],
    ["", "a file with no detected type"],
  ])("rejects %s (%s) by type", (type) => {
    expect(validateConsentUpload({ type, size: 1024 })).toBe(
      "Unsupported file type. Please choose a PDF, JPG or PNG."
    );
  });

  it("rejects a file one byte over the limit", () => {
    const msg = validateConsentUpload({ type: "application/pdf", size: MAX_CONSENT_UPLOAD_SIZE + 1 });
    expect(msg).toContain("too large");
    expect(msg).toContain(MAX_CONSENT_UPLOAD_SIZE_LABEL);
  });

  it("reports the offending file's actual size, so the user knows by how much", () => {
    expect(validateConsentUpload({ type: "image/png", size: 12 * MB })).toContain("12.0 MB");
  });

  it("rejects an empty file", () => {
    expect(validateConsentUpload({ type: "application/pdf", size: 0 })).toContain("empty");
  });

  it("checks type before size, so a bad type is named rather than the size", () => {
    expect(validateConsentUpload({ type: "application/zip", size: 50 * MB })).toContain(
      "Unsupported file type"
    );
  });
});

describe("consentObjectPath", () => {
  const clinic = "11111111-1111-4111-8111-111111111111";
  const patient = "22222222-2222-4222-8222-222222222222";
  const consent = "33333333-3333-4333-8333-333333333333";

  it("puts clinic_id first and patient_id second — the segments storage RLS keys on", () => {
    const segments = consentObjectPath(clinic, patient, consent, "scan.pdf").split("/");
    expect(segments[0]).toBe(clinic);
    expect(segments[1]).toBe(patient);
    expect(segments[2]).toBe(consent);
  });

  it("confines a hostile file name to a single trailing path segment", () => {
    const path = consentObjectPath(clinic, patient, consent, "../../etc/passwd consent!.pdf");
    const segments = path.split("/");
    // Traversal needs a separator; the sanitiser replaces every "/" (and space,
    // and "!") with "_", so the name cannot escape the {clinic}/{patient}/
    // {consent}/ prefix that storage RLS keys on. Dots are legal in file names
    // and are kept — harmless once separators are gone.
    expect(segments).toHaveLength(4);
    expect(segments[3]).not.toContain("/");
    expect(segments[3]).toMatch(/^\d+-\.\._\.\._etc_passwd_consent_\.pdf$/);
  });
});

describe("isImageMime", () => {
  it("is true for images and false for PDFs and nullish values", () => {
    expect(isImageMime("image/png")).toBe(true);
    expect(isImageMime("application/pdf")).toBe(false);
    expect(isImageMime(null)).toBe(false);
    expect(isImageMime(undefined)).toBe(false);
  });
});

describe("upload limit fits the Server Action transport", () => {
  const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

  it("next.config.ts sets bodySizeLimit explicitly (Next defaults it to 1 MB)", () => {
    expect(config).toMatch(/bodySizeLimit:\s*["'][\d.]+mb["']/i);
  });

  it("bodySizeLimit leaves room above MAX_CONSENT_UPLOAD_SIZE for multipart overhead", () => {
    const limitMb = Number(/bodySizeLimit:\s*["']([\d.]+)mb["']/i.exec(config)?.[1]);
    expect(Number.isFinite(limitMb)).toBe(true);
    expect(limitMb * MB).toBeGreaterThan(MAX_CONSENT_UPLOAD_SIZE);
  });

  it("stays within the ~4.5 MB request-body cap Vercel applies to functions", () => {
    expect(MAX_CONSENT_UPLOAD_SIZE).toBeLessThanOrEqual(4.5 * MB);
  });

  it("the label matches the numeric limit", () => {
    expect(MAX_CONSENT_UPLOAD_SIZE_LABEL).toBe(`${MAX_CONSENT_UPLOAD_SIZE / MB} MB`);
  });

  it("every accepted type is a real upload mime type", () => {
    expect([...ALLOWED_CONSENT_UPLOAD_TYPES]).toEqual([
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
    ]);
  });
});
