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
          "flex min-h-[80px] w-full rounded-lg border bg-white px-3 py-2 text-sm",
          "text-[#09090B] placeholder:text-[#A1A1AA]",
          "resize-none transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 focus-visible:border-accent",
          "disabled:cursor-not-allowed disabled:bg-[#F4F4F5] disabled:text-[#A1A1AA]",
          hasError
            ? "border-[#DC2626] focus-visible:ring-[#DC2626]/20"
            : "border-[#E4E4E7] hover:border-[#D4D4D8]",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
