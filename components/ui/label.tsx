import { cn } from "@/lib/utils";
import { forwardRef } from "react";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          "block text-sm font-medium text-[#151918] leading-none",
          className
        )}
        {...props}
      >
        {children}
        {required && (
          <span className="ml-0.5 text-[#DC2626]" aria-hidden="true">*</span>
        )}
      </label>
    );
  }
);
Label.displayName = "Label";
