import { cn, APPOINTMENT_STATUS_LABELS, getAppointmentStatusVariant } from "@/lib/utils";
import type { AppointmentStatus } from "@/types";

interface AppointmentStatusBadgeProps {
  status: AppointmentStatus;
  className?: string;
}

const VARIANT_CLASSES = {
  default: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  info:    "bg-blue-100 text-blue-700",
  error:   "bg-red-100 text-red-700",
} as const;

/**
 * AppointmentStatusBadge
 *
 * Color-coded status badge for all appointment_status enum values.
 * Used across all role views wherever an appointment status is displayed.
 */
export function AppointmentStatusBadge({
  status,
  className,
}: AppointmentStatusBadgeProps) {
  const variant = getAppointmentStatusVariant(status);

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  );
}
