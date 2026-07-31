import { cn } from "@/lib/utils";
import type { StatusView } from "@/lib/business-brain/dashboard-view";
import { confidenceLabel } from "@/lib/business-brain/dashboard-view";

interface BrainStatusBannerProps {
  status: StatusView;
  /** Metrics the engine was able to compute for this day. */
  measuredCount: number;
  /** Checks that could not run at all. */
  unmeasuredCount: number;
  confidence?: number;
}

const STATUS_STYLES: Record<
  StatusView["status"],
  { dot: string; ring: string; badge: "danger" | "warning" | "info" | "success" | "secondary" }
> = {
  critical: { dot: "bg-[#DC2626]", ring: "ring-[#FECACA]", badge: "danger" },
  attention: { dot: "bg-[#DC2626]", ring: "ring-[#FECACA]", badge: "danger" },
  watch: { dot: "bg-[#CA8A04]", ring: "ring-[#FEF08A]", badge: "warning" },
  steady: { dot: "bg-[#16A34A]", ring: "ring-[#BBF7D0]", badge: "success" },
  unknown: { dot: "bg-[#A1A1AA]", ring: "ring-[#E4E4E7]", badge: "secondary" },
};

/**
 * The one-glance read: what state is the clinic in today.
 *
 * Shows a status, not a score. A composite number would be more compact but
 * nobody could explain it, and the coverage line beside it is the point —
 * it says how much of the picture this verdict is actually based on.
 */
export function BrainStatusBanner({
  status,
  measuredCount,
  unmeasuredCount,
  confidence,
}: BrainStatusBannerProps) {
  const style = STATUS_STYLES[status.status];

  return (
    <section
      className="bg-white border border-[#E4E4E7] rounded-xl p-5 sm:p-6 animate-fade-in"
      aria-label="Clinic status"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
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

        {/* Signal and pattern counts used to sit here. They are pipeline
            stages: one problem routinely produces three signals and two
            patterns, so the chips said "7 signals, 4 patterns" directly above a
            heading that correctly said three things need attention. Two counts
            that disagree teach a reader to trust neither. */}
      </div>

      {/* Coverage — how much of the picture this verdict rests on. */}
      <div className="mt-5 pt-4 border-t border-[#F4F4F5] flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <p className="text-xs font-medium text-[#71717A] tracking-wide">Measurements taken</p>
          <p className="text-sm font-medium text-[#09090B] mt-0.5">{measuredCount}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-[#71717A] tracking-wide">Checks unavailable</p>
          <p
            className={cn(
              "text-sm font-medium mt-0.5",
              unmeasuredCount > 0 ? "text-[#CA8A04]" : "text-[#09090B]",
            )}
          >
            {unmeasuredCount}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-[#71717A] tracking-wide">Data coverage</p>
          <p className="text-sm font-medium text-[#09090B] mt-0.5">
            {confidenceLabel(confidence)}
          </p>
        </div>
      </div>
    </section>
  );
}
