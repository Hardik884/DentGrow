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
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createServerClient } from "@/lib/supabase/server";
import { getClinicConfig } from "@/lib/clinic/config";
import { getTodayInTimezone } from "@/lib/utils";
import { BusinessBrain, type BusinessBrainResult } from "@/business-brain";
import { SupabaseMetricsDataRepository } from "./metrics-repository";

/**
 * Days of history loaded so the Diagnosis Engine can classify persistence —
 * whether something is a one-off, ongoing, worsening or improving.
 *
 * The engine's `minimumHistoryDays` is 3, so 7 gives it a real window while
 * staying inside one clinic-week. Each day is a separate snapshot read, so this
 * is the main cost of a dashboard load; it is acceptable for the demo clinic and
 * is the first thing to tune if the page ever feels slow.
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
 * Read-only: the orchestrator's only collaborator is the repository, whose sole
 * method is a read. Uses the request's own Supabase session rather than the
 * service role, so RLS still applies and the dashboard cannot see further than
 * the dentist can.
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
  const brain = new BusinessBrain({ repository });

  const result = await brain.runBusinessBrain(clinicId, businessDate, {
    historyDays: HISTORY_DAYS,
  });

  return { result, clinicId, date: businessDate, timezone };
}
