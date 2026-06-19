import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

const SIZE_CLASSES = {
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-2",
  lg: "w-10 h-10 border-4",
};

/**
 * LoadingSpinner
 *
 * Standard loading state indicator.
 * Used in all async sections while data is fetching.
 */
export function LoadingSpinner({
  size = "md",
  className,
  label = "Loading…",
}: LoadingSpinnerProps) {
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      role="status"
      aria-label={label}
    >
      <div
        className={cn(
          "rounded-full border-gray-300 border-t-blue-600 animate-spin",
          SIZE_CLASSES[size]
        )}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
