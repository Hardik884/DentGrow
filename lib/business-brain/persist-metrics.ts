/**
 * Recording measured metrics.
 *
 * Separate from the dashboard path on purpose. Running the Business Brain is
 * read-only — a page render must not write, and `pipeline.spec.ts` asserts the
 * whole run leaves every table's row count unchanged. This is the explicit
 * writer, called by a scheduled job (or a one-off backfill), never by a render.
 *
 * Uses the SERVICE ROLE, because `metric_history` grants SELECT to a dentist and
 * INSERT to nobody: a client that could write here could fabricate the clinic's
 * own history. Every function takes an explicit `clinicId` and scopes to it —
 * the service role bypasses RLS, so the scoping is the caller's responsibility
 * and is done in one place here rather than at each query.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { DentGrowMetricsEngine, addDays } from "@/business-brain";
import { SupabaseMetricsDataRepository } from "./metrics-repository";
import { SupabaseMetricHistoryStore } from "./metric-history-store";

export interface PersistResult {
  /** Business dates written, ascending. */
  readonly written: readonly string[];
  /** Dates that could not be measured, with the reason. */
  readonly failed: readonly { date: string; error: string }[];
}

/**
 * Measure one clinic-day and record it.
 *
 * Intended for COMPLETED days. Today's figures are still moving — a snapshot
 * taken at 11:00 does not describe the day — so recording today would freeze a
 * half-finished number as if it were the day's result. The scheduled caller
 * should ask for yesterday; {@link persistYesterday} does exactly that.
 *
 * Idempotent: the store upserts on (clinic, date, key), so re-running a day
 * corrects it rather than duplicating. That is also how a correction is
 * propagated after a data fix.
 */
export async function persistMetricDay(
  clinicId: string,
  date: string,
  db?: SupabaseClient<Database>,
): Promise<void> {
  const client = db ?? (createAdminClient() as unknown as SupabaseClient<Database>);
  const engine = new DentGrowMetricsEngine(new SupabaseMetricsDataRepository(client));
  const store = new SupabaseMetricHistoryStore(client);

  const metrics = await engine.calculateMetrics(clinicId, date);
  if (metrics.length === 0) return;

  await store.writeMetricDay(clinicId, {
    date,
    metrics: metrics.map((m) => ({
      // Metric ids are `key:clinicId:date`. The key contains dots but never a
      // colon, so the first segment is the key.
      key: m.id.slice(0, m.id.indexOf(":")),
      value: m.value,
      measuredAt: m.timestamp,
    })),
  });
}

/**
 * Record an inclusive range of days, oldest first.
 *
 * Used to backfill history so the Diagnosis Engine has something to classify
 * persistence against before the daily job has run for a week.
 *
 * Days are written SEQUENTIALLY and a failure does not stop the run: one
 * unreadable day should cost that day, not the other six. Failures are returned
 * rather than thrown so the caller can report exactly which dates are missing —
 * a partially-filled history is honest, and the Diagnosis Engine already treats
 * an absent day as `unknown` rather than as a quiet one.
 */
export async function persistMetricRange(
  clinicId: string,
  from: string,
  to: string,
  db?: SupabaseClient<Database>,
): Promise<PersistResult> {
  const client = db ?? (createAdminClient() as unknown as SupabaseClient<Database>);
  const written: string[] = [];
  const failed: { date: string; error: string }[] = [];

  for (let date = from; date <= to; date = addDays(date, 1)) {
    try {
      await persistMetricDay(clinicId, date, client);
      written.push(date);
    } catch (error) {
      failed.push({ date, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { written, failed };
}

/**
 * Record the day that just finished, in the clinic's own timezone.
 *
 * The timezone matters: "yesterday" for a clinic in IST is not yesterday for the
 * server, and a job running at 00:30 UTC would otherwise record the wrong day.
 */
export async function persistYesterday(
  clinicId: string,
  todayInClinicTimezone: string,
  db?: SupabaseClient<Database>,
): Promise<void> {
  await persistMetricDay(clinicId, addDays(todayInClinicTimezone, -1), db);
}
