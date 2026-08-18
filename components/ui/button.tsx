"use client";

import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { forwardRef } from "react";

export type ButtonVariant = "default" | "secondary" | "ghost" | "outline" | "danger" | "link";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  isLoading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  default:   "bg-accent text-accent-foreground hover:bg-accent-hover active:bg-accent-active shadow-sm focus-visible:ring-accent",
  secondary: "bg-surface-muted text-text-primary hover:bg-border active:bg-surface-pressed focus-visible:ring-accent",
  ghost:     "text-text-primary hover:bg-surface-muted active:bg-border focus-visible:ring-accent",
  outline:   "border border-border bg-surface text-text-primary hover:border-border-strong hover:bg-surface-secondary focus-visible:ring-accent",
  danger:    "bg-danger text-danger-foreground hover:bg-danger-hover active:bg-danger-active shadow-sm focus-visible:ring-danger",
  link:      "text-accent underline-offset-4 hover:underline p-0 h-auto",
};

const sizeClasses: Record<ButtonSize, string> = {
  xs:   "h-7 px-2 text-xs rounded-[4px]",
  sm:   "h-8 px-3 text-xs rounded-[6px]",
  md:   "h-9 px-4 text-sm rounded-[8px]",
  lg:   "h-10 px-5 text-sm rounded-[8px]",
  icon: "h-8 w-8 rounded-[8px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    variant = "default",
    size = "md",
    asChild = false,
    isLoading = false,
    className,
    children,
    disabled,
    ...props
  }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium",
          "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
          "select-none whitespace-nowrap cursor-pointer active:scale-[0.98]",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <>
            <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);

Button.displayName = "Button";
