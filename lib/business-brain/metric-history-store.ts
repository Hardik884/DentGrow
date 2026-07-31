/**
 * Supabase adapter for the Business Brain's metric history port.
 *
 * The port lives in `business-brain/` and knows nothing about Postgres; this is
 * the only place the `metric_history` table is touched. Same split as
 * `metrics-repository.ts`: the contract belongs to the module, the data access
 * belongs to the app.
 *
 * Pass a SERVICE-ROLE client. The table has a read policy for dentists and no
 * write policy at all — by design, since a client that could write here could
 * fabricate the clinic's own history — so writes only work as the service role.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  MetricHistoryStore,
  StoredMetric,
  StoredMetricDay,
} from "@/business-brain";
import type { Database } from "@/types/database.types";

interface MetricHistoryRow {
  metric_date: string;
  metric_key: string;
  value: number | string | null;
  measured_at: string;
}

export class SupabaseMetricHistoryStore implements MetricHistoryStore {
  private readonly db: SupabaseClient<Database>;

  constructor(db: SupabaseClient<Database>) {
    this.db = db;
  }

  async readMetricDays(
    clinicId: string,
    from: string,
    to: string,
  ): Promise<readonly StoredMetricDay[]> {
    const { data, error } = await this.db
      .from("metric_history")
      .select("metric_date, metric_key, value, measured_at")
      .eq("clinic_id", clinicId)
      .gte("metric_date", from)
      .lte("metric_date", to)
      .order("metric_date", { ascending: true });
    if (error) throw new Error(`metric_history read: ${error.message}`);

    // Group into days. A date absent from the result stays absent from the
    // output — the caller must be able to tell "not measured" from "measured
    // zero", and an empty day would read as the latter.
    const byDate = new Map<string, StoredMetric[]>();
    for (const row of ((data ?? []) as unknown[]) as MetricHistoryRow[]) {
      const list = byDate.get(row.metric_date) ?? [];
      list.push({
        key: row.metric_key,
        // `value` is double precision, but PostgREST can still hand back a
        // string depending on the client's parsing; normalise once here rather
        // than leaving every reader to wonder.
        value: Number(row.value ?? 0),
        measuredAt: row.measured_at,
      });
      byDate.set(row.metric_date, list);
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, metrics]) => ({ date, metrics }));
  }

  async writeMetricDay(clinicId: string, day: StoredMetricDay): Promise<void> {
    if (day.metrics.length === 0) return;

    // Upsert on the primary key so re-measuring a day corrects it rather than
    // duplicating or failing. A day is legitimately written more than once —
    // by the scheduled job, and again by a backfill or a correction.
    const { error } = await this.db.from("metric_history").upsert(
      day.metrics.map((m) => ({
        clinic_id: clinicId,
        metric_date: day.date,
        metric_key: m.key,
        value: m.value,
        measured_at: m.measuredAt,
      })),
      { onConflict: "clinic_id,metric_date,metric_key" },
    );
    if (error) throw new Error(`metric_history write: ${error.message}`);
  }
}
