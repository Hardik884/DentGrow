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
    <div className={cn("bg-surface border border-border rounded-xl p-5 shadow-[0_1px_2px_rgba(21,25,24,0.04)]", className)}>
      <p className="text-xs font-medium text-text-secondary tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-text-primary tracking-tight mt-2 leading-none">{value}</p>
      {sub && <p className="text-xs text-text-disabled mt-2">{sub}</p>}
      {trend && (
        <p className={cn("text-xs mt-1 font-medium", trend.positive ? "text-success" : "text-danger")}>
          {trend.positive ? "↑" : "↓"} {trend.value}
        </p>
      )}
    </div>
  );
}
