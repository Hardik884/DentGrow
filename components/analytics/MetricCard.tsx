import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: string; positive: boolean };
  /** @deprecated Use the neutral design instead — accent is ignored in the new design. */
  accent?: string;
  className?: string;
}

/**
 * MetricCard — single KPI card for analytics dashboards.
 * Neutral, clean — no colored backgrounds.
 */
export function MetricCard({ label, value, sub, trend, className }: MetricCardProps) {
  return (
    <div className={cn("bg-white border border-[#E4E4E7] rounded-xl p-5", className)}>
      <p className="text-xs font-medium text-[#71717A] tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-[#09090B] tracking-tight mt-2">{value}</p>
      {sub && <p className="text-xs text-[#A1A1AA] mt-1">{sub}</p>}
      {trend && (
        <p className={cn("text-xs mt-1 font-medium", trend.positive ? "text-[#16A34A]" : "text-[#DC2626]")}>
          {trend.positive ? "↑" : "↓"} {trend.value}
        </p>
      )}
    </div>
  );
}
