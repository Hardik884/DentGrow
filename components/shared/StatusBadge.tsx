import { cn } from "@/lib/utils";
import type { BadgeVariant } from "@/lib/utils";

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  error:   "bg-red-100 text-red-700",
  info:    "bg-blue-100 text-blue-700",
};

/**
 * StatusBadge
 *
 * Generic status badge. Accepts label + variant.
 * Use AppointmentStatusBadge for appointment-specific statuses.
 */
export function StatusBadge({
  label,
  variant = "default",
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {label}
    </span>
  );
}
