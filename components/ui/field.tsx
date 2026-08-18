import { cn } from "@/lib/utils";
import { Label } from "./label";

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Field — form field wrapper with label, error, and hint support.
 * Used across all forms for consistent spacing and visual hierarchy.
 */
export function Field({ label, required, error, hint, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-text-secondary">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-danger flex items-center gap-1" role="alert">
          <svg
            className="h-3 w-3 shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
