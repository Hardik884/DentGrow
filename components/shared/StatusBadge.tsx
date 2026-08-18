import { cn } from "@/lib/utils";
import type { BadgeVariant } from "@/lib/utils";

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-surface-muted text-text-secondary",
  success: "bg-success-bg text-success border border-success-border",
  warning: "bg-warning-bg text-warning border border-warning-border",
  error:   "bg-danger-bg text-danger border border-danger-border",
  info:    "bg-info-bg text-info border border-info-border",
};

export function StatusBadge({ label, variant = "default", className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium leading-none",
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {label}
    </span>
  );
}
