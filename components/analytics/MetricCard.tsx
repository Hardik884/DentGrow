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
    <div className={cn("bg-white border border-[#E3E9E6] rounded-xl p-5 shadow-[0_1px_2px_rgba(21,25,24,0.04)]", className)}>
      <p className="text-xs font-medium text-[#737A76] tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-[#151918] tracking-tight mt-2 leading-none">{value}</p>
      {sub && <p className="text-xs text-[#9BA39D] mt-2">{sub}</p>}
      {trend && (
        <p className={cn("text-xs mt-1 font-medium", trend.positive ? "text-[#16A34A]" : "text-[#DC2626]")}>
          {trend.positive ? "↑" : "↓"} {trend.value}
        </p>
      )}
    </div>
  );
}
