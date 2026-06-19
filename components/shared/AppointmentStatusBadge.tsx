import { cn, APPOINTMENT_STATUS_LABELS, getAppointmentStatusVariant } from "@/lib/utils";
import type { AppointmentStatus } from "@/types";

interface AppointmentStatusBadgeProps {
  status: AppointmentStatus;
  className?: string;
}

const VARIANT_CLASSES = {
  default: "bg-[#F4F4F5] text-[#71717A]",
  success: "bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]",
  warning: "bg-[#FEFCE8] text-[#CA8A04] border border-[#FEF08A]",
  info:    "bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]",
  error:   "bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]",
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
