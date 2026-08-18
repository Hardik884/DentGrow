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
  default:   "bg-accent text-accent-foreground hover:bg-accent-hover focus-visible:ring-accent",
  secondary: "bg-[#F4F4F5] text-[#09090B] hover:bg-[#E4E4E7] focus-visible:ring-accent",
  ghost:     "text-[#09090B] hover:bg-[#F4F4F5] focus-visible:ring-accent",
  outline:   "border border-[#E4E4E7] bg-[#FFFFFF] text-[#09090B] hover:bg-[#F4F4F5] focus-visible:ring-accent",
  danger:    "bg-[#DC2626] text-white hover:bg-[#B91C1C] focus-visible:ring-[#DC2626]",
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
          "inline-flex items-center justify-center gap-2 font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "select-none whitespace-nowrap",
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
