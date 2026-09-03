/**
 * lib/security/__tests__/file-validation.spec.ts
 *
 * Every upload path used to accept `file.type` — the browser's guess, derived
 * from the extension, sent in a header the caller controls. These assertions
 * are all versions of the same attack: bytes that are not what the request
 * claims they are.
 */

import { describe, it, expect } from "vitest";
import {
  actualContentType,
  assertContentMatchesType,
  assertImageContentMatches,
  detectFormat,
  scanUpload,
} from "../file-validation";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
const HTML = [...Buffer.from("<html><script>alert(1)</script>")];
const ELF = [0x7f, 0x45, 0x4c, 0x46];

/** A File whose CONTENT and claimed type can be set independently. */
function fileOf(bytes: number[], claimedType: string, name = "upload"): File {
  return new File([new Uint8Array([...bytes, ...new Array(64).fill(0)])], name, {
    type: claimedType,
  });
}

const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];

describe("format detection reads bytes, not headers", () => {
  it("identifies the real formats", () => {
    expect(detectFormat(new Uint8Array(PNG))?.label).toBe("PNG");
    expect(detectFormat(new Uint8Array(JPEG))?.label).toBe("JPEG");
    expect(detectFormat(new Uint8Array(PDF))?.label).toBe("PDF");
  });

  it("recognises none of the things that are not those", () => {
    expect(detectFormat(new Uint8Array(HTML))).toBeNull();
    expect(detectFormat(new Uint8Array(ELF))).toBeNull();
    expect(detectFormat(new Uint8Array([]))).toBeNull();
  });

  it("requires the whole PNG header, including the CRLF trap", () => {
    // \r\n\x1a\n exists in the PNG signature to detect a file mangled by a
    // text-mode transfer. A truncated header is not a PNG.
    expect(detectFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});

describe("a file must be what it claims", () => {
  it("rejects HTML uploaded as a PNG", async () => {
    const file = fileOf(HTML, "image/png", "xray.png");
    const error = await assertContentMatchesType(file, DOCUMENT_TYPES);
    expect(error).toBeTruthy();
    expect(error).toMatch(/does not look like/i);
  });

  it("rejects a binary uploaded as a PDF", async () => {
    const file = fileOf(ELF, "application/pdf", "report.pdf");
    expect(await assertContentMatchesType(file, DOCUMENT_TYPES)).toBeTruthy();
  });

  it("rejects an empty file", async () => {
    const file = new File([], "empty.png", { type: "image/png" });
    expect(await assertContentMatchesType(file, DOCUMENT_TYPES)).toMatch(/empty/i);
  });

  it("accepts a real PDF, JPEG and PNG", async () => {
    for (const [bytes, type] of [
      [PDF, "application/pdf"],
      [JPEG, "image/jpeg"],
      [PNG, "image/png"],
    ] as const) {
      expect(await assertContentMatchesType(fileOf(bytes, type), DOCUMENT_TYPES)).toBeNull();
    }
  });

  it("accepts an honestly mislabelled file — a JPEG named .png", async () => {
    // A phone camera or scanner producing this is not an attack, and failing it
    // would break real uploads for no security gain. The REAL format is what
    // gets recorded.
    const file = fileOf(JPEG, "image/png", "photo.png");
    expect(await assertContentMatchesType(file, DOCUMENT_TYPES)).toBeNull();
    expect(await actualContentType(file)).toBe("image/jpeg");
  });

  it("rejects a real PDF where only images are accepted", async () => {
    const file = fileOf(PDF, "image/png", "signature.png");
    const error = await assertImageContentMatches(file);
    expect(error).toMatch(/PDF/);
  });

  it("accepts a real PNG signature", async () => {
    expect(await assertImageContentMatches(fileOf(PNG, "image/png"))).toBeNull();
  });
});

describe("the stored content type comes from the bytes", () => {
  it("does not echo the caller's claim", async () => {
    // This is the value the object is later SERVED with, so it must not be
    // attacker-chosen.
    expect(await actualContentType(fileOf(PNG, "application/pdf"))).toBe("image/png");
    expect(await actualContentType(fileOf(PDF, "image/png"))).toBe("application/pdf");
  });
});

describe("the scanning seam is honest about doing nothing", () => {
  it("reports not-scanned rather than clean", async () => {
    // A stub that returned "clean" would let a caller believe uploads are
    // scanned when nothing is scanning them — worse than the absent scanner.
    const verdict = await scanUpload(fileOf(PNG, "image/png"));
    expect(verdict.status).toBe("not-scanned");
    expect(verdict.status).not.toBe("clean");
  });
});
