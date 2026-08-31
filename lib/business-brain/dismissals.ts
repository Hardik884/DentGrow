/**
 * lib/business-brain/dismissals.ts
 *
 * Reading which Business Brain problems a clinic has chosen to snooze.
 *
 * ## Why this is a filter and not part of the pipeline
 *
 * The engines are pure functions over clinic data, and a dismissal is not clinic
 * data — it is a preference about presentation. Feeding it upstream would make
 * two runs over identical clinic data produce different diagnoses, which is
 * exactly the determinism the whole Business Brain is built on. So the run is
 * unchanged and complete, and this decides what the briefing draws from it.
 *
 * A dismissal therefore never hides a measurement: the metric, the signal and
 * the diagnosis are all still in the result, still auditable, still stored in
 * history. Only the card is suppressed.
 *
 * ## The escalation rule
 *
 * A date-only snooze is unsafe. "Three patients owe money" dismissed for a month
 * would keep hiding the card when it becomes forty patients owing ten times as
 * much, and the clinic would never learn that the thing they judged unimportant
 * stopped being unimportant. So a dismissal carries the severity it was made
 * against, and is honoured only while the problem has not got worse.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { Severity } from "@/business-brain";

/** One active suppression: the category, and how bad it was when snoozed. */
export interface ActiveDismissal {
  readonly category: string;
  readonly severityAtDismissal: string;
  readonly reason: string;
  readonly expiresAt: string;
}

/**
 * Severity ranking, worst last. Local to this module on purpose — it answers
 * "has this got worse", which is a different question from the Constraint
 * Engine's "which of these contributing diagnoses is worst", and coupling the
 * two would make a change to one silently alter the other.
 */
const SEVERITY_RANK: Readonly<Record<string, number>> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Active dismissals for a clinic, newest per category.
 *
 * Never throws: a failure to read preferences must not cost the dentist their
 * briefing. On error the caller gets an empty map, which shows everything — the
 * safe direction, because the failure mode is "you see a card you snoozed"
 * rather than "you miss a problem you did not".
 */
export async function readActiveDismissals(
  db: SupabaseClient<Database>,
  clinicId: string,
  now: string,
): Promise<ReadonlyMap<string, ActiveDismissal>> {
  const active = new Map<string, ActiveDismissal>();
  try {
    const { data, error } = await db
      .from("problem_dismissals")
      .select("category, severity_at_dismissal, reason, expires_at")
      .eq("clinic_id", clinicId)
      .gt("expires_at", now)
      .order("expires_at", { ascending: false });
    if (error) return active;

    for (const row of data ?? []) {
      // Ordered newest-expiry first, so the first row seen for a category is the
      // one that governs; later (shorter) ones are superseded history.
      if (active.has(row.category)) continue;
      active.set(row.category, {
        category: row.category,
        severityAtDismissal: row.severity_at_dismissal,
        reason: row.reason,
        expiresAt: row.expires_at,
      });
    }
  } catch {
    return active;
  }
  return active;
}

/**
 * Whether a problem should be hidden right now.
 *
 * Pure, so the rule is testable without a database. Unknown severities fail
 * OPEN — an unrecognised value means we cannot prove the problem has not
 * escalated, and showing a snoozed card is a far cheaper mistake than hiding an
 * escalated one.
 */
export function isSuppressed(
  dismissal: ActiveDismissal | undefined,
  currentSeverity: Severity,
): boolean {
  if (dismissal === undefined) return false;

  const dismissedAt = SEVERITY_RANK[dismissal.severityAtDismissal];
  const current = SEVERITY_RANK[currentSeverity];
  if (dismissedAt === undefined || current === undefined) return false;

  // Worse than when it was snoozed: the decision was made about a smaller
  // problem, so it no longer applies.
  return current <= dismissedAt;
}
