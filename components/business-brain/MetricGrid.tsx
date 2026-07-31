import { formatCurrency } from "@/lib/utils";
import type { Metric } from "@/business-brain";
import type { MetricGroup } from "@/lib/business-brain/dashboard-view";

interface MetricGridProps {
  groups: readonly MetricGroup[];
}

/** Render a value in the unit the engine already assigned to it. */
function formatMetric(metric: Metric): string {
  switch (metric.unit) {
    case "currency":
      return formatCurrency(metric.value);
    case "percentage":
      return `${metric.value}%`;
    case "minutes":
      // Chair time runs to hundreds of minutes, which nobody reads as a
      // duration. Above two hours, show hours — trimming a trailing ".0" so a
      // whole working day reads "8 hr" rather than "8.0 hr". Kept in minutes on
      // the metric itself, because that is the unit the arithmetic is exact in.
      if (metric.value >= 120) {
        return `${(Math.round((metric.value / 60) * 10) / 10).toString()} hr`;
      }
      return `${metric.value} min`;
    case "hours":
      return `${metric.value} hr`;
    case "days":
      return `${metric.value} ${metric.value === 1 ? "day" : "days"}`;
    default:
      return String(metric.value);
  }
}

/**
 * The underlying facts, grouped by what they describe.
 *
 * Placed last on the page on purpose. These are reference material — a dentist
 * scanning the dashboard wants the observations first and the raw numbers only
 * when they want to check one. Leading with twenty-five tiles would bury the
 * three things that actually changed.
 *
 * A metric the engine could not measure honestly is simply absent rather than
 * shown as zero; the run details panel names what is missing and why.
 */
export function MetricGrid({ groups }: MetricGridProps) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.category}>
          <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider mb-2.5">
            {group.label}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {group.metrics.map((metric) => (
              <div
                key={metric.id}
                className="bg-white border border-[#E4E4E7] rounded-xl p-4"
              >
                <p className="text-xs font-medium text-[#71717A] tracking-wide leading-snug">
                  {metric.name}
                </p>
                <p className="text-xl font-semibold text-[#09090B] tracking-tight mt-1.5">
                  {formatMetric(metric)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
