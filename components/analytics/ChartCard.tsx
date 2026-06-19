import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * ChartCard
 *
 * Standard wrapper for all analytics charts.
 * Handles loading state, error state, and the card frame.
 * Individual chart components only render their chart content inside this wrapper.
 */
export function ChartCard({
  title,
  children,
  isLoading = false,
  error = null,
  className,
}: ChartCardProps) {
  return (
    <div className={cn("bg-white border rounded-lg p-4", className)}>
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <LoadingSpinner size="md" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-48 text-sm text-gray-400">
          {error}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
