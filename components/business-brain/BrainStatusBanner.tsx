import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import type { Metric } from "@/business-brain";
import type { StatusView } from "@/lib/business-brain/dashboard-view";

interface BrainStatusBannerProps {
  status: StatusView;
  measuredCount: number;
  unmeasuredCount: number;
  confidence?: number;
  /** The 6 headline metrics, shown inline as the day's vital signs. */
  headline?: readonly Metric[];
}

const STATUS_STYLES: Record<
  StatusView["status"],
  { dot: string; ring: string }
> = {
  critical: { dot: "bg-[#DC2626]", ring: "ring-[#FECACA]" },
  attention: { dot: "bg-[#DC2626]", ring: "ring-[#FECACA]" },
  watch: { dot: "bg-[#CA8A04]", ring: "ring-[#FEF08A]" },
  steady: { dot: "bg-[#16A34A]", ring: "ring-[#BBF7D0]" },
  unknown: { dot: "bg-[#A1A1AA]", ring: "ring-[#E4E4E7]" },
};

/**
 * The one-glance morning read.
 *
 * Answers two questions at once:
 *   1. "Is anything wrong?" — the status dot and headline
 *   2. "What are today's numbers?" — the 6 vital signs
 *
 * Previously these were two separate sections (status banner + Today's Numbers).
 * Merging them eliminates one scroll position and gives the dentist their full
 * "am I okay?" answer in a single card.
 */
export function BrainStatusBanner({
  status,
  measuredCount,
  unmeasuredCount,
  confidence,
  headline = [],
}: BrainStatusBannerProps) {
  const style = STATUS_STYLES[status.status];

  return (
    <section
      className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden animate-fade-in"
      aria-label="Clinic status"
    >
      {/* Status headline */}
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3.5 min-w-0">
          <span
            className={cn("mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ring-4", style.dot, style.ring)}
            aria-hidden
          />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#09090B] tracking-tight">
              {status.headline}
            </h2>
            <p className="text-sm text-[#71717A] mt-1 leading-relaxed">{status.detail}</p>
          </div>
        </div>
      </div>

      {/* Headline metrics — the day's vital signs */}
      {headline.length > 0 && (
        <div className="border-t border-[#F4F4F5] px-5 sm:px-6 py-4 bg-[#FAFAFA]/50">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {headline.map((metric) => (
              <div key={metric.id} className="min-w-0">
                <p className="text-[11px] font-medium text-[#71717A] tracking-wide uppercase truncate">
                  {metric.name}
                </p>
                <p className="text-lg font-semibold text-[#09090B] tracking-tight mt-0.5 tabular-nums">
                  {formatMetricValue(metric)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coverage — small, informational, not the point */}
      {unmeasuredCount > 0 && (
        <div className="border-t border-[#F4F4F5] px-5 sm:px-6 py-2.5 flex items-center gap-4">
          <p className="text-xs text-[#A1A1AA]">
            {measuredCount} checks ran · {unmeasuredCount} could not run
          </p>
        </div>
      )}
    </section>
  );
}

function formatMetricValue(metric: Metric): string {
  switch (metric.unit) {
    case "currency":
      return formatCurrency(metric.value);
    case "percentage":
      return `${metric.value}%`;
    case "minutes":
      return metric.value >= 120
        ? `${Math.round((metric.value / 60) * 10) / 10} hr`
        : `${metric.value} min`;
    case "hours":
      return `${metric.value} hr`;
    case "days":
      return `${metric.value} ${metric.value === 1 ? "day" : "days"}`;
    default:
      return String(metric.value);
  }
}
