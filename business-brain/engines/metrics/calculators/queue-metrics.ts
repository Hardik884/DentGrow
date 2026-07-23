/**
 * Metrics Engine — Queue calculators
 */

import type { Metric } from "../../../domain";
import type { ClinicDataSnapshot, QueueEntrySnapshot } from "../../../repositories";
import { MetricKey, buildMetric } from "../metric-ids";

/** Patients currently waiting — queue entries with status `waiting`. */
export function patientsWaiting(s: ClinicDataSnapshot): Metric {
  const value = s.queueToday.filter((q) => q.status === "waiting").length;
  return buildMetric(MetricKey.QUEUE_PATIENTS_WAITING, value, s.clinicId, s.date, s.asOf);
}

/** Waiting duration in minutes for a single entry, using `asOf` for open waits. */
function waitMinutes(entry: QueueEntrySnapshot, asOf: string): number | null {
  const start = Date.parse(entry.checkedInAt);
  // An entry that is still waiting has not been called in yet: measure up to `asOf`.
  const endIso = entry.startedAt ?? asOf;
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }
  return (end - start) / 60_000;
}

/**
 * Average waiting time (minutes) across today's queue entries. For entries that
 * have been called in, the wait is checkedIn → startedAt; for entries still
 * waiting, it is checkedIn → `asOf`. Entries with unusable timestamps are
 * skipped. Returns 0 when there is nothing to measure.
 */
export function averageWaitingTime(s: ClinicDataSnapshot): Metric {
  const waits: number[] = [];
  for (const entry of s.queueToday) {
    const minutes = waitMinutes(entry, s.asOf);
    if (minutes !== null) {
      waits.push(minutes);
    }
  }
  const average =
    waits.length === 0 ? 0 : waits.reduce((sum, m) => sum + m, 0) / waits.length;
  // Round to one decimal place for a clean, stable figure.
  const value = Math.round(average * 10) / 10;
  return buildMetric(MetricKey.QUEUE_AVERAGE_WAITING_TIME, value, s.clinicId, s.date, s.asOf);
}
