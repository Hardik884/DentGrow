import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageAction {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  backHref?: string;
  action?: PageAction;
  /** Slot for custom right-side content (filters, extra buttons, etc.) */
  children?: React.ReactNode;
}

/**
 * PageHeader
 *
 * Consistent page title area across all dashboard pages.
 * Supports: back navigation, description text, primary action button, and
 * an optional children slot for custom right-side elements (date pickers, etc.)
 */
export function PageHeader({ title, description, backHref, action, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-5 sm:mb-6">
      <div className="space-y-0.5 min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors mb-1"
          >
            <ChevronLeft className="h-3 w-3" aria-hidden />
            Back
          </Link>
        )}
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary tracking-tight break-words">{title}</h1>
        {description && (
          <p className="text-sm text-text-secondary mt-0.5">{description}</p>
        )}
      </div>

      {(action || children) && (
        <div className="flex items-center gap-2 flex-wrap sm:shrink-0 sm:mt-0.5">
          {children}
          {action && (
            <Button asChild size="sm">
              <Link href={action.href}>
                {action.icon && <span aria-hidden>{action.icon}</span>}
                {action.label}
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
