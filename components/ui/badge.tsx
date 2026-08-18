import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "accent";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:   "bg-[#151918] text-white",
  secondary: "bg-[#EEF2F0] text-[#151918]",
  outline:   "border border-[#E3E9E6] text-[#737A76] bg-transparent",
  accent:    "bg-[#E8F4F0] text-[#09544B] border border-[#CFE7E0]",
  success:   "bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]",
  warning:   "bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]",
  danger:    "bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]",
  info:      "bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]",
};

export function Badge({ variant = "secondary", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium leading-none",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
