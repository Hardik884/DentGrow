/**
 * lib/security/__tests__/events.spec.ts
 *
 * Security events go to the process log, where a drain can route on them. Two
 * things have to hold for that to be worth doing:
 *
 *   - the line is machine-readable, with a stable prefix an alert rule matches;
 *   - it contains nothing that would make the security log itself a disclosure.
 *     A log of failed sign-ins that carries email addresses is a harvestable
 *     list of who has an account here — the exact asset the log exists to
 *     protect.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SECURITY_LOG_PREFIX,
  recordSecurityEvent,
  subjectHash,
} from "../events";

afterEach(() => vi.restoreAllMocks());

function captureError(): { lines: string[] } {
  const lines: string[] = [];
  vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  return { lines };
}

function captureInfo(): { lines: string[] } {
  const lines: string[] = [];
  vi.spyOn(console, "info").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  return { lines };
}

describe("the emitted line is machine-readable", () => {
  it("carries the stable prefix and valid JSON", () => {
    const { lines } = captureError();
    recordSecurityEvent("AUTH_LOCKED_OUT", { subjectHash: "abc123", count: 8 });

    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith(SECURITY_LOG_PREFIX)).toBe(true);

    const payload = JSON.parse(lines[0].slice(SECURITY_LOG_PREFIX.length));
    expect(payload.event).toBe("AUTH_LOCKED_OUT");
    expect(payload.severity).toBe("warning");
    expect(payload.count).toBe(8);
    expect(typeof payload.at).toBe("string");
  });

  it("is one line, so a log drain does not have to reassemble it", () => {
    const { lines } = captureError();
    recordSecurityEvent("TENANT_BOUNDARY_REFUSED", { reason: "wrong-clinic" });
    expect(lines[0]).not.toContain("\n");
  });

  it("routes routine events to info and notable ones to error", () => {
    const info = captureInfo();
    const error = captureError();

    recordSecurityEvent("AUTH_FAILED");
    recordSecurityEvent("TENANT_BOUNDARY_REFUSED");

    expect(info.lines).toHaveLength(1);
    expect(error.lines).toHaveLength(1);
  });
});

describe("the log does not become a disclosure", () => {
  it("hashes an email rather than recording it", () => {
    const hash = subjectHash("rohan.sharma@example.com");

    expect(hash).not.toContain("@");
    expect(hash).not.toContain("rohan");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("hashes the same address to the same handle, so failures are countable", () => {
    expect(subjectHash("A@Example.com ")).toBe(subjectHash("a@example.com"));
  });

  it("hashes different addresses differently", () => {
    expect(subjectHash("a@example.com")).not.toBe(subjectHash("b@example.com"));
  });
});

describe("logging never breaks the thing it is observing", () => {
  it("swallows a failure in the logger itself", () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("log transport down");
    });

    // This runs inside sign-in. Throwing here would turn a logging fault into
    // an authentication outage.
    expect(() => recordSecurityEvent("TENANT_BOUNDARY_REFUSED")).not.toThrow();
  });
});
