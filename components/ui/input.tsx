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
          "text-[#151918] placeholder:text-[#9BA39D]",
          "transition-[border-color,box-shadow] duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D6B5E]/20 focus-visible:border-[#0D6B5E]",
          "disabled:cursor-not-allowed disabled:bg-[#EEF2F0] disabled:text-[#9BA39D]",
          hasError
            ? "border-[#DC2626] focus-visible:ring-[#DC2626]/20 focus-visible:border-[#DC2626]"
            : "border-[#E3E9E6] hover:border-[#CBD5D0]",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
