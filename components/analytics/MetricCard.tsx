import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "default" | "green" | "red" | "blue" | "amber";
  className?: string;
}

const ACCENT_CLASSES: Record<string, string> = {
  default: "bg-white border",
  green:   "bg-green-50 border border-green-200",
  red:     "bg-red-50 border border-red-200",
  blue:    "bg-blue-50 border border-blue-200",
  amber:   "bg-amber-50 border border-amber-200",
};

const VALUE_CLASSES: Record<string, string> = {
  default: "text-gray-900",
  green:   "text-green-700",
  red:     "text-red-700",
  blue:    "text-blue-700",
  amber:   "text-amber-700",
};

/**
 * MetricCard — single KPI card for analytics dashboards.
 * Server component — no interactivity needed.
 */
export function MetricCard({
  label,
  value,
  sub,
  accent = "default",
  className,
}: MetricCardProps) {
  return (
    <div className={cn("rounded-lg p-4", ACCENT_CLASSES[accent], className)}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={cn("text-2xl font-bold mt-1", VALUE_CLASSES[accent])}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
