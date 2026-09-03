/**
 * lib/auth/__tests__/mfa.spec.ts
 *
 * Where two-factor authentication is required, and — just as importantly —
 * where it is not.
 *
 * The dangerous failure here is not "MFA was skipped". It is "MFA locked
 * someone out": a receptionist at 9am with a queue forming, or a platform admin
 * shut out of the console they would use to fix it. So the gate's NEGATIVE
 * cases get as much attention as its positive one.
 */

import { describe, it, expect, afterEach } from "vitest";
import { adminMfaRequired, mfaGateFor, readMfaStatus, type MfaStatus } from "../mfa";

const ORIGINAL = process.env.REQUIRE_ADMIN_MFA;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.REQUIRE_ADMIN_MFA;
  else process.env.REQUIRE_ADMIN_MFA = ORIGINAL;
});

function status(over: Partial<MfaStatus> = {}): MfaStatus {
  return {
    current: "aal1",
    next: "aal1",
    enrolled: false,
    challengeRequired: false,
    ...over,
  };
}

describe("readMfaStatus", () => {
  it("treats a verified-factor account at aal1 as needing a challenge", async () => {
    const supabase = {
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: async () => ({
            data: { currentLevel: "aal1", nextLevel: "aal2" },
            error: null,
          }),
        },
      },
    };

    const result = await readMfaStatus(supabase);
    expect(result.enrolled).toBe(true);
    expect(result.challengeRequired).toBe(true);
  });

  it("treats a satisfied session as done", async () => {
    const supabase = {
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: async () => ({
            data: { currentLevel: "aal2", nextLevel: "aal2" },
            error: null,
          }),
        },
      },
    };

    const result = await readMfaStatus(supabase);
    expect(result.enrolled).toBe(true);
    expect(result.challengeRequired).toBe(false);
  });

  it("treats an account with no factor as needing nothing", async () => {
    const supabase = {
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: async () => ({
            data: { currentLevel: "aal1", nextLevel: "aal1" },
            error: null,
          }),
        },
      },
    };

    const result = await readMfaStatus(supabase);
    expect(result.enrolled).toBe(false);
    expect(result.challengeRequired).toBe(false);
  });

  it("fails OPEN when the check itself errors", async () => {
    // Deliberate. This runs in middleware on every navigation; a transient
    // Auth error must not lock a whole clinic out of its own records. The
    // password check has already happened, and the position this falls back to
    // is exactly the one the product was in before MFA existed.
    const supabase = {
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: async () => ({
            data: null,
            error: { message: "network" },
          }),
        },
      },
    };

    const result = await readMfaStatus(supabase);
    expect(result.challengeRequired).toBe(false);
    expect(result.enrolled).toBe(false);
  });

  it("survives the call throwing", async () => {
    const supabase = {
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: async () => {
            throw new Error("boom");
          },
        },
      },
    };

    await expect(readMfaStatus(supabase)).resolves.toMatchObject({
      challengeRequired: false,
    });
  });
});

describe("adminMfaRequired", () => {
  it("is off unless explicitly enabled", () => {
    // The default is load-bearing: turning this on before the admin has
    // enrolled locks that account out of the console it would use to fix it.
    delete process.env.REQUIRE_ADMIN_MFA;
    expect(adminMfaRequired()).toBe(false);

    for (const value of ["", "1", "yes", "TRUE"]) {
      process.env.REQUIRE_ADMIN_MFA = value;
      expect(adminMfaRequired()).toBe(false);
    }
  });

  it("is on for the exact string", () => {
    process.env.REQUIRE_ADMIN_MFA = "true";
    expect(adminMfaRequired()).toBe(true);
  });
});

describe("mfaGateFor", () => {
  it("challenges anyone who has enrolled but not verified this session", () => {
    delete process.env.REQUIRE_ADMIN_MFA;
    expect(
      mfaGateFor(status({ enrolled: true, challengeRequired: true }), { isAdmin: false })
    ).toBe("challenge");
  });

  it("lets an unenrolled non-admin through", () => {
    // Enabling enrolment must not lock anybody out. This is the assertion that
    // says so.
    delete process.env.REQUIRE_ADMIN_MFA;
    expect(mfaGateFor(status(), { isAdmin: false })).toBe("none");
  });

  it("lets an unenrolled admin through while the requirement is off", () => {
    delete process.env.REQUIRE_ADMIN_MFA;
    expect(mfaGateFor(status(), { isAdmin: true })).toBe("none");
  });

  it("sends an unenrolled admin to ENROL — not to a code box — once required", () => {
    process.env.REQUIRE_ADMIN_MFA = "true";
    expect(mfaGateFor(status(), { isAdmin: true })).toBe("enrol");
  });

  it("still only challenges an admin who has already enrolled", () => {
    process.env.REQUIRE_ADMIN_MFA = "true";
    expect(
      mfaGateFor(status({ enrolled: true, challengeRequired: true }), { isAdmin: true })
    ).toBe("challenge");
  });

  it("lets a fully verified admin through", () => {
    process.env.REQUIRE_ADMIN_MFA = "true";
    expect(
      mfaGateFor(status({ current: "aal2", next: "aal2", enrolled: true }), {
        isAdmin: true,
      })
    ).toBe("none");
  });
});
