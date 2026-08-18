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
          "flex h-9 w-full rounded-lg border bg-surface px-3 py-2 text-sm",
          "text-text-primary placeholder:text-text-disabled",
          "transition-[border-color,box-shadow] duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 focus-visible:border-accent",
          "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-disabled",
          hasError
            ? "border-danger focus-visible:ring-danger/20 focus-visible:border-danger"
            : "border-border hover:border-border-strong",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
