import { cn } from "@/lib/utils";
import { forwardRef } from "react";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hasError, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[80px] w-full rounded-lg border bg-surface px-3 py-2 text-sm",
          "text-text-primary placeholder:text-text-disabled",
          "resize-none transition-[border-color,box-shadow] duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 focus-visible:border-accent",
          "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-disabled",
          hasError
            ? "border-danger focus-visible:ring-danger/20"
            : "border-border hover:border-border-strong",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
