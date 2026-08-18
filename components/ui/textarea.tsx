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
          "text-[#151918] placeholder:text-[#9BA39D]",
          "resize-none transition-[border-color,box-shadow] duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D6B5E]/20 focus-visible:border-[#0D6B5E]",
          "disabled:cursor-not-allowed disabled:bg-[#EEF2F0] disabled:text-[#9BA39D]",
          hasError
            ? "border-[#DC2626] focus-visible:ring-[#DC2626]/20"
            : "border-[#E3E9E6] hover:border-[#CBD5D0]",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
