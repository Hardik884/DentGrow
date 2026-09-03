import "server-only";

/**
 * lib/security/events.ts
 *
 * Structured security events — the things a monitor should be able to alert on.
 *
 * WHY A SEPARATE CHANNEL FROM phi_access_log
 *   They answer different questions and have different readers. phi_access_log
 *   answers "who looked at this patient's record", is scoped to a clinic, and
 *   is read by that clinic's dentist. This answers "is something wrong with the
 *   platform" — repeated failed sign-ins, a caller reaching for another
 *   tenant's data, a privilege change — and its reader is whoever operates
 *   OraMedha.
 *
 *   Several of these events happen when there is no clinic and no session at
 *   all: a failed sign-in has no authenticated user to attribute it to, which
 *   is exactly what makes it interesting. They do not fit a tenant-scoped
 *   table.
 *
 * WHERE THEY GO
 *   To the process log, as a single-line JSON object with a fixed prefix. That
 *   is not a placeholder — it is the shape a log drain can actually route on.
 *   The platform (Vercel, Supabase) already collects stdout, so these events
 *   arrive wherever those logs arrive, and a drain can match on the prefix and
 *   alert on the `event` field without parsing prose.
 *
 *   → REQUIRES MANUAL CONFIGURATION: a log drain and alert rules. Nothing here
 *     sends an alert by itself, and the code does not pretend otherwise. See
 *     docs/SECURITY.md for the events worth alerting on and the thresholds.
 *
 * WHAT NEVER GOES IN ONE
 *   The same rule as the audit log, for the same reason: no names, no phone
 *   numbers, no clinical content, no passwords, no tokens. Emails are hashed
 *   rather than logged, so repeated failures against one account are countable
 *   without the log becoming a list of who has an account here.
 */

import { createHash } from "node:crypto";

export type SecurityEvent =
  /** A password check failed. */
  | "AUTH_FAILED"
  /** Repeated failures from the same identifier crossed the lockout threshold. */
  | "AUTH_LOCKED_OUT"
  /** A correct password, at the wrong door (patient at /login, staff at /admin/login). */
  | "AUTH_WRONG_AUDIENCE"
  /** A non-admin reached an admin surface. */
  | "ADMIN_ACCESS_DENIED"
  /** A caller asked for a resource belonging to another clinic. */
  | "TENANT_BOUNDARY_REFUSED"
  /** A signed URL or storage read was refused. */
  | "STORAGE_ACCESS_DENIED"
  /** An outbound AI prompt was withheld because it contained something it must not. */
  | "AI_PROMPT_WITHHELD"
  /** MFA was enrolled, removed, or a challenge failed. */
  | "MFA_ENROLLED"
  | "MFA_UNENROLLED"
  | "MFA_CHALLENGE_FAILED"
  /** A scheduled job that deletes data ran. */
  | "RETENTION_PURGE_RAN";

export type SecuritySeverity = "info" | "warning" | "critical";

/**
 * Fields a security event may carry. Everything here is either an opaque
 * identifier, a count, or a word from a fixed vocabulary.
 */
export type SecurityEventDetail = {
  /** Authenticated user id, when there is one. */
  userId?: string | null;
  /** Clinic the action concerned, when it concerned one. */
  clinicId?: string | null;
  /** Role, when known. */
  role?: string | null;
  /** A stable, non-reversible handle for an unauthenticated subject. */
  subjectHash?: string | null;
  /** Which sign-in door, endpoint or surface. */
  surface?: string | null;
  /** Fixed-vocabulary reason code, never a raw error message. */
  reason?: string | null;
  /** How many times, for threshold events. */
  count?: number | null;
};

/**
 * A one-way handle for an email address.
 *
 * Counting "five failures against the same account" requires a stable key.
 * Logging the address itself would turn the security log into a list of who
 * has an account here, harvestable by anyone who reaches the logs — the exact
 * asset the log exists to protect. A truncated SHA-256 is stable, useless for
 * contacting anyone, and short enough to read in a log line.
 *
 * Not a secret and not claimed to be: an attacker who guesses an address can
 * confirm it by hashing. That is fine — they already knew the address. What it
 * prevents is the log DISCLOSING addresses nobody knew.
 */
export function subjectHash(value: string): string {
  return createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

const SEVERITY: Record<SecurityEvent, SecuritySeverity> = {
  AUTH_FAILED: "info",
  AUTH_LOCKED_OUT: "warning",
  AUTH_WRONG_AUDIENCE: "warning",
  ADMIN_ACCESS_DENIED: "warning",
  TENANT_BOUNDARY_REFUSED: "critical",
  STORAGE_ACCESS_DENIED: "warning",
  AI_PROMPT_WITHHELD: "critical",
  MFA_ENROLLED: "info",
  MFA_UNENROLLED: "warning",
  MFA_CHALLENGE_FAILED: "warning",
  RETENTION_PURGE_RAN: "info",
};

/** The prefix a log drain matches on. Do not change it casually — alert rules key on it. */
export const SECURITY_LOG_PREFIX = "[security]";

/**
 * Emits one security event.
 *
 * Synchronous and never throws: this is called from inside authentication and
 * authorisation paths, and a logging failure must not become a sign-in failure.
 */
export function recordSecurityEvent(
  event: SecurityEvent,
  detail: SecurityEventDetail = {}
): void {
  try {
    const severity = SEVERITY[event];

    const payload = {
      event,
      severity,
      at: new Date().toISOString(),
      // Undefined keys are dropped by JSON.stringify, so a sparse detail stays
      // a short line.
      ...detail,
    };

    const line = `${SECURITY_LOG_PREFIX} ${JSON.stringify(payload)}`;

    // console.error for anything a human should look at, so it lands on the
    // stream platforms treat as an error and shows up in default alerting.
    if (severity === "info") console.info(line);
    else console.error(line);
  } catch {
    // Deliberately silent. There is nowhere useful to report a failure to
    // report, and throwing here would break the sign-in it was observing.
  }
}
