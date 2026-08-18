import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

const SIZE_CLASSES = {
  sm: "w-3.5 h-3.5 border-[1.5px]",
  md: "w-5 h-5 border-2",
  lg: "w-8 h-8 border-2",
};

export function LoadingSpinner({ size = "md", className, label = "Loading…" }: LoadingSpinnerProps) {
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      role="status"
      aria-label={label}
    >
      <div
        className={cn(
          "rounded-full border-border border-t-accent animate-spin",
          SIZE_CLASSES[size]
        )}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
