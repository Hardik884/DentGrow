/**
 * lib/business-brain/dashboard-data.ts
 *
 * Server-side entry point for the Business Brain dashboard.
 *
 * It wires the Supabase repository into the existing orchestrator and returns
 * the run. No metric, signal or diagnosis is computed here — this file only
 * decides which clinic and which date to ask about.
 */

import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createServerClient } from "@/lib/supabase/server";
import { getClinicConfig } from "@/lib/clinic/config";
import { getTodayInTimezone } from "@/lib/utils";
import { addDays } from "@/business-brain";
import { BusinessBrain, type BusinessBrainResult } from "@/business-brain";
import { SupabaseMetricsDataRepository } from "./metrics-repository";
import { SupabaseMetricHistoryStore } from "./metric-history-store";
import { recordRecomputedHistory } from "./persist-metrics";

/**
 * Days of history loaded so the Diagnosis Engine can classify persistence —
 * whether something is a one-off, ongoing, worsening or improving.
 *
 * The engine's `minimumHistoryDays` is 3, so 7 gives it a real window while
 * staying inside one clinic-week.
 *
 * Days already recorded in `metric_history` are read rather than recomputed, so
 * the cost of this is one snapshot per day the persistence job has not yet
 * covered — in a steady state, none.
 */
const HISTORY_DAYS = 7;

export interface DashboardRun {
  readonly result: BusinessBrainResult;
  readonly clinicId: string;
  readonly date: string;
  readonly timezone: string;
}

/**
 * Run the pipeline for the caller's clinic on a business date.
 *
 * Read-only, and deliberately kept that way: a page render must not write, and
 * `pipeline.spec.ts` asserts the whole run leaves every table's row count
 * unchanged. Recording measurements is a separate, explicit step — see
 * `persistMetricDay` in ./persist-metrics.ts.
 *
 * Uses the request's own Supabase session rather than the service role, so RLS
 * still applies and the dashboard cannot see further than the dentist can. That
 * is also why the history store here can only ever read: `metric_history` grants
 * SELECT to a dentist and INSERT to nobody.
 *
 * @param date Business date "YYYY-MM-DD". Defaults to today in the clinic's
 *             timezone — not the server's.
 */
export async function runDashboardBrain(date?: string): Promise<DashboardRun> {
  const { clinicId, timezone } = await getClinicConfig();
  const businessDate = date ?? getTodayInTimezone(timezone);

  // @supabase/ssr's client and @supabase/supabase-js's client are structurally
  // the same at runtime but carry different generic parameters, so the two do
  // not unify. Narrowed here rather than widening the repository's public type,
  // which would lose the typing the rest of the codebase relies on. Same root
  // cause as the TYPING NOTE in ./metrics-repository.ts.
  const supabase = (await createServerClient()) as unknown as SupabaseClient<Database>;
  const repository = new SupabaseMetricsDataRepository(supabase);
  const brain = new BusinessBrain({
    repository,
    historyStore: new SupabaseMetricHistoryStore(supabase),
  });

  const result = await brain.runBusinessBrain(clinicId, businessDate, {
    historyDays: HISTORY_DAYS,
  });

  // Self-healing history.
  //
  // The run just measured every history day the store did not have. Writing
  // those back means the next load reads them instead of measuring them again,
  // so history fills itself the first time anyone opens the page — no scheduler,
  // no external job.
  //
  // `after` runs this once the response has been sent, so the render itself
  // stays read-only and the dentist never waits on a write. Only COMPLETED days
  // are recorded: today's figures are still moving, and freezing them would
  // store a half-finished number as if it were the day's result.
  const lastCompletedDay = addDays(businessDate, -1);
  const finishedDays = result.recomputedHistory.filter((day) => day.date <= lastCompletedDay);
  if (finishedDays.length > 0) {
    after(() => recordRecomputedHistory(clinicId, finishedDays));
  }

  return { result, clinicId, date: businessDate, timezone };
}
