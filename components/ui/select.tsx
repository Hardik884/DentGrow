import { cn } from "@/lib/utils";
import { forwardRef } from "react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, hasError, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "flex h-9 w-full appearance-none rounded-lg border bg-white px-3 py-2 text-sm",
          "text-[#151918] transition-[border-color,box-shadow] duration-150",
          "bg-[url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%23737A76' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E\")] bg-[length:20px_20px] bg-[right_8px_center] bg-no-repeat pr-8",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D6B5E]/20 focus-visible:border-[#0D6B5E]",
          "disabled:cursor-not-allowed disabled:bg-[#EEF2F0] disabled:text-[#9BA39D]",
          hasError
            ? "border-[#DC2626] focus-visible:ring-[#DC2626]/20"
            : "border-[#E3E9E6] hover:border-[#CBD5D0]",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";
