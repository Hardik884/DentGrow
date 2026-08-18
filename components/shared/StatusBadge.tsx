import { cn } from "@/lib/utils";
import type { BadgeVariant } from "@/lib/utils";

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-[#EEF2F0] text-[#737A76]",
  success: "bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]",
  warning: "bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]",
  error:   "bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]",
  info:    "bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]",
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
