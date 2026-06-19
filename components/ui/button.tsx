"use client";

import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { forwardRef } from "react";

export type ButtonVariant = "default" | "secondary" | "ghost" | "outline" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  isLoading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  default:   "bg-[#18181B] text-[#FAFAFA] hover:bg-[#27272A] focus-visible:ring-[#18181B]",
  secondary: "bg-[#F4F4F5] text-[#09090B] hover:bg-[#E4E4E7] focus-visible:ring-[#18181B]",
  ghost:     "text-[#09090B] hover:bg-[#F4F4F5] focus-visible:ring-[#18181B]",
  outline:   "border border-[#E4E4E7] bg-[#FFFFFF] text-[#09090B] hover:bg-[#F4F4F5] focus-visible:ring-[#18181B]",
  danger:    "bg-[#DC2626] text-white hover:bg-[#B91C1C] focus-visible:ring-[#DC2626]",
  link:      "text-[#09090B] underline-offset-4 hover:underline p-0 h-auto",
};

const sizeClasses: Record<ButtonSize, string> = {
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
