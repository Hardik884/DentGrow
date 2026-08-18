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
  default:   "bg-text-primary text-background",
  secondary: "bg-surface-muted text-text-primary",
  outline:   "border border-border text-text-secondary bg-transparent",
  accent:    "bg-accent-soft text-accent-hover border border-accent-soft-border",
  success:   "bg-success-bg text-success border border-success-border",
  warning:   "bg-warning-bg text-warning border border-warning-border",
  danger:    "bg-danger-bg text-danger border border-danger-border",
  info:      "bg-info-bg text-info border border-info-border",
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
