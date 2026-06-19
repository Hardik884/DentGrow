import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "danger"
  | "info";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:   "bg-[#18181B] text-[#FAFAFA]",
  secondary: "bg-[#F4F4F5] text-[#09090B]",
  outline:   "border border-[#E4E4E7] text-[#71717A] bg-transparent",
  success:   "bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]",
  warning:   "bg-[#FEFCE8] text-[#CA8A04] border border-[#FEF08A]",
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
