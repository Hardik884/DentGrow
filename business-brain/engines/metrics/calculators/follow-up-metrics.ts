/**
 * Metrics Engine — Follow-up calculators
 */

import type { Metric } from "../../../domain";
import type { ClinicDataSnapshot } from "../../../repositories";
import { MetricKey, buildMetric } from "../metric-ids";

/** Follow-ups due today — pending follow-ups with a due date equal to today. */
export function followUpsDueToday(s: ClinicDataSnapshot): Metric {
  const value = s.followUps.filter(
    (f) => f.status === "pending" && f.dueDate === s.date,
  ).length;
  return buildMetric(MetricKey.FOLLOWUPS_DUE_TODAY, value, s.clinicId, s.date, s.asOf);
}

/** Overdue follow-ups — pending follow-ups whose due date is before today. */
export function overdueFollowUps(s: ClinicDataSnapshot): Metric {
  const value = s.followUps.filter(
    (f) => f.status === "pending" && f.dueDate < s.date,
  ).length;
  return buildMetric(MetricKey.FOLLOWUPS_OVERDUE, value, s.clinicId, s.date, s.asOf);
}
