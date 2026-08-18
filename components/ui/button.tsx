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
  default:   "bg-[#0D6B5E] text-white hover:bg-[#09544B] active:bg-[#084A42] shadow-sm focus-visible:ring-[#0D6B5E]",
  secondary: "bg-[#EEF2F0] text-[#151918] hover:bg-[#E3E9E6] active:bg-[#D8E0DB] focus-visible:ring-[#0D6B5E]",
  ghost:     "text-[#151918] hover:bg-[#EEF2F0] active:bg-[#E3E9E6] focus-visible:ring-[#0D6B5E]",
  outline:   "border border-[#E3E9E6] bg-white text-[#151918] hover:border-[#CBD5D0] hover:bg-[#FAFCFA] focus-visible:ring-[#0D6B5E]",
  danger:    "bg-[#DC2626] text-white hover:bg-[#B91C1C] active:bg-[#9F1414] shadow-sm focus-visible:ring-[#DC2626]",
  link:      "text-[#0D6B5E] underline-offset-4 hover:underline p-0 h-auto",
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
