import { cn } from "@/lib/utils";
import { SkeletonCard } from "@/components/ui/skeleton";

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
  action?: React.ReactNode;
}

/**
 * ChartCard — standard wrapper for all analytics charts.
 * Clean, minimal — no colored backgrounds.
 * Handles loading (skeleton), error, and empty states.
 */
export function ChartCard({
  title,
  description,
  children,
  isLoading = false,
  error = null,
  className,
  action,
}: ChartCardProps) {
  if (isLoading) {
    return <SkeletonCard className={cn("min-h-[200px]", className)} />;
  }

  return (
    <div className={cn("bg-white border border-[#E3E9E6] rounded-xl overflow-hidden", className)}>
      <div className="px-5 py-4 border-b border-[#E3E9E6] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#151918]">{title}</h3>
          {description && (
            <p className="text-xs text-[#737A76] mt-0.5">{description}</p>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>

      <div className="p-5">
        {error ? (
          <div className="flex items-center justify-center min-h-[160px] text-sm text-[#9BA39D]">
            {error}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
