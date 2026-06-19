import { cn } from "@/lib/utils";
import { forwardRef } from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasError, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-9 w-full rounded-lg border bg-white px-3 py-2 text-sm",
          "text-[#09090B] placeholder:text-[#A1A1AA]",
          "transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181B]/20 focus-visible:border-[#18181B]",
          "disabled:cursor-not-allowed disabled:bg-[#F4F4F5] disabled:text-[#A1A1AA]",
          hasError
            ? "border-[#DC2626] focus-visible:ring-[#DC2626]/20 focus-visible:border-[#DC2626]"
            : "border-[#E4E4E7] hover:border-[#D4D4D8]",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
