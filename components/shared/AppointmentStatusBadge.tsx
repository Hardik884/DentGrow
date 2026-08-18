import { cn, APPOINTMENT_STATUS_LABELS, getAppointmentStatusVariant } from "@/lib/utils";
import type { AppointmentStatus } from "@/types";

interface AppointmentStatusBadgeProps {
  status: AppointmentStatus;
  className?: string;
}

const VARIANT_CLASSES = {
  default: "bg-surface-muted text-text-secondary",
  success: "bg-success-bg text-success border border-success-border",
  warning: "bg-warning-bg text-warning border border-warning-border",
  info:    "bg-info-bg text-info border border-info-border",
  error:   "bg-danger-bg text-danger border border-danger-border",
} as const;

export function AppointmentStatusBadge({ status, className }: AppointmentStatusBadgeProps) {
  const variant = getAppointmentStatusVariant(status);

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium leading-none",
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  );
}
