/**
 * lib/audit/__tests__/phi-access.spec.ts
 *
 * The failure this guards against is specific and easy to commit: a developer
 * adds `context: { patientName: patient.name }` to make a log line more useful
 * to read, and the audit log quietly becomes a second copy of the clinical
 * record — one with a longer retention period and a different set of readers
 * than the record it describes.
 *
 * sanitizeContext is the thing that makes that impossible, so it is tested
 * directly and adversarially: real PHI is passed in under both permitted and
 * unpermitted keys, and none of it may survive.
 */

import { describe, it, expect } from "vitest";
import { sanitizeContext } from "../phi-access";

describe("sanitizeContext — nothing identifying survives", () => {
  it("drops keys that are not on the allow-list, however plausible they look", () => {
    const clean = sanitizeContext({
      // These are exactly the fields someone would reach for.
      patientName: "Rohan Sharma",
      phone: "+919812345678",
      notes: "Root canal, upper left molar, patient reports sensitivity",
      internalNotes: "suspected fracture",
      email: "rohan@example.com",
      amount: 4500,
      dateOfBirth: "1988-04-02",
      diagnosis: "irreversible pulpitis",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(clean).toEqual({});
  });

  it("keeps only the small non-identifying facts it is meant to keep", () => {
    const clean = sanitizeContext({
      surface: "patient-profile",
      count: 3,
      self: true,
      ttlSeconds: 300,
    });

    expect(clean).toEqual({
      surface: "patient-profile",
      count: 3,
      self: true,
      ttlSeconds: 300,
    });
  });

  it("refuses a whole record smuggled in under an allowed key", () => {
    const clean = sanitizeContext({
      // `surface` is allowed — but only as a string.
      surface: { name: "Rohan Sharma", phone: "+919812345678" },
      count: [1, 2, 3],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(clean).toEqual({});
  });

  it("truncates an over-long string rather than storing it", () => {
    const smuggled = "A".repeat(500);
    const clean = sanitizeContext({ reason: smuggled });

    expect(typeof clean.reason).toBe("string");
    expect((clean.reason as string).length).toBeLessThanOrEqual(64);
  });

  it("collapses whitespace, so a pasted multi-line note cannot arrive intact", () => {
    const clean = sanitizeContext({
      reason: "wrong-clinic\n\n  patient: Rohan Sharma\n  phone: 9812345678",
    });
    expect(clean.reason).not.toContain("\n");
    expect((clean.reason as string).length).toBeLessThanOrEqual(64);
  });

  it("stores a search term's LENGTH and never the term", () => {
    const clean = sanitizeContext({ queryLength: "Rohan".length });
    expect(clean).toEqual({ queryLength: 5 });
  });

  it("drops numbers that do not serialise meaningfully", () => {
    const clean = sanitizeContext({ count: NaN, ttlSeconds: Infinity });
    expect(clean).toEqual({});
  });

  it("handles an absent context", () => {
    expect(sanitizeContext(undefined)).toEqual({});
    expect(sanitizeContext({})).toEqual({});
  });
});

describe("no secret can be written to the log", () => {
  it("drops anything resembling a credential", () => {
    const clean = sanitizeContext({
      accessToken: "eyJhbGciOiJIUzI1NiIs.payload.sig",
      apiKey: "AIzaSyDUMMYKEYFORTESTONLY",
      password: "hunter2",
      serviceRoleKey: "service-role-secret",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(clean).toEqual({});
  });
});
