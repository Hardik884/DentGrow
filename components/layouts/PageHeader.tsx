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
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="space-y-0.5">
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-xs text-[#71717A] hover:text-[#09090B] transition-colors mb-1"
          >
            <ChevronLeft className="h-3 w-3" aria-hidden />
            Back
          </Link>
        )}
        <h1 className="text-xl font-semibold text-[#09090B] tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-[#71717A]">{description}</p>
        )}
      </div>

      {(action || children) && (
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
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
