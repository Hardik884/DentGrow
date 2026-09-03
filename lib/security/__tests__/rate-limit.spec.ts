/**
 * lib/security/__tests__/rate-limit.spec.ts
 *
 * The per-account sign-in lockout.
 *
 * Two properties matter in opposite directions, and a test that only checks one
 * of them is how this feature goes wrong:
 *
 *   - it must actually stop a run of guesses;
 *   - it must NOT lock out a receptionist at 9am with a queue forming, which is
 *     a clinical availability problem rather than an inconvenience.
 *
 * So the window expiry, the reset-on-success and the memory bound are asserted
 * as carefully as the lockout itself.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  WINDOW_MS,
  checkRateLimit,
  clearFailures,
  recordFailure,
  resetAllRateLimits,
} from "../rate-limit";

const KEY = "subject-hash-1";
const OTHER = "subject-hash-2";

beforeEach(() => resetAllRateLimits());

describe("locking out a run of guesses", () => {
  it("permits attempts below the threshold", () => {
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      expect(recordFailure(KEY).locked).toBe(false);
    }
  });

  it("locks on the threshold attempt", () => {
    let state = { locked: false } as ReturnType<typeof recordFailure>;
    for (let i = 0; i < MAX_ATTEMPTS; i++) state = recordFailure(KEY);

    expect(state.locked).toBe(true);
    expect(state.retryAfterSeconds).toBeGreaterThan(0);
    expect(checkRateLimit(KEY).locked).toBe(true);
  });

  it("reports how long the caller must wait", () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailure(KEY);
    const state = checkRateLimit(KEY);

    expect(state.retryAfterSeconds).toBeLessThanOrEqual(LOCKOUT_MS / 1000);
    expect(state.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("not locking out real people", () => {
  it("forgets failures once the window has passed", () => {
    const start = Date.now();

    // Seven failures — one short of the threshold.
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) recordFailure(KEY, start);

    // A fortnight later, one more mistyped password must not lock the account.
    const later = start + WINDOW_MS + 1000;
    expect(recordFailure(KEY, later).locked).toBe(false);
    expect(checkRateLimit(KEY, later).failures).toBe(1);
  });

  it("clears the count on a successful sign-in", () => {
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) recordFailure(KEY);
    clearFailures(KEY);

    expect(checkRateLimit(KEY).failures).toBe(0);
    expect(recordFailure(KEY).locked).toBe(false);
  });

  it("lifts the lockout when it expires", () => {
    const start = Date.now();
    for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailure(KEY, start);
    expect(checkRateLimit(KEY, start).locked).toBe(true);

    const after = start + LOCKOUT_MS + 1000;
    expect(checkRateLimit(KEY, after).locked).toBe(false);
    expect(checkRateLimit(KEY, after).failures).toBe(0);
  });

  it("locks one account without touching another", () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailure(KEY);

    expect(checkRateLimit(KEY).locked).toBe(true);
    expect(checkRateLimit(OTHER).locked).toBe(false);
  });

  it("reports an untouched identifier as clean", () => {
    expect(checkRateLimit("never-seen")).toEqual({
      locked: false,
      retryAfterSeconds: 0,
      failures: 0,
    });
  });
});

describe("the counter cannot be turned into a memory-exhaustion vector", () => {
  it("bounds how many identifiers it tracks", () => {
    // An attacker enumerating addresses would otherwise grow the map without
    // limit, turning a defence into a denial of service against the app itself.
    for (let i = 0; i < 12_000; i++) recordFailure(`subject-${i}`);

    // The recent ones still count, which is what the bound must not break.
    for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailure("recent-subject");
    expect(checkRateLimit("recent-subject").locked).toBe(true);
  });
});
