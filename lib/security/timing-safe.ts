import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * `a !== b` on strings short-circuits at the first differing byte, so how long
 * the comparison takes reveals how much of a guess was correct. That turns
 * brute-forcing a shared secret from infeasible into a few thousand requests per
 * character.
 *
 * Both sides are hashed before comparison rather than compared directly. That is
 * not for secrecy — it is because `timingSafeEqual` throws when its two buffers
 * differ in length, and catching that would itself leak the secret's length.
 * SHA-256 gives two fixed-width buffers whatever the inputs were.
 *
 * Returns false for a missing or empty candidate, so an absent header can never
 * match an unset environment variable.
 */
export function secretsMatch(candidate: string | null | undefined, expected: string | undefined): boolean {
  if (!candidate || !expected) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
