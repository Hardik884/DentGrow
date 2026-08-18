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
          "flex h-9 w-full appearance-none rounded-lg border bg-surface px-3 py-2 text-sm",
          "text-text-primary transition-[border-color,box-shadow] duration-150",
          // The chevron is a background image, so it cannot inherit currentColor.
          // --select-chevron holds a per-theme copy of the SVG (see globals.css).
          "bg-[image:var(--select-chevron)] bg-[length:20px_20px] bg-[right_8px_center] bg-no-repeat pr-8",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 focus-visible:border-accent",
          "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-disabled",
          hasError
            ? "border-danger focus-visible:ring-danger/20"
            : "border-border hover:border-border-strong",
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
