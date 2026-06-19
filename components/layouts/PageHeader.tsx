import Link from "next/link";

interface PageAction {
  label: string;
  href: string;
}

interface PageHeaderProps {
  title: string;
  backHref?: string;
  action?: PageAction;
}

/**
 * PageHeader
 *
 * Standard page title bar with optional back link and primary action button.
 * Used at the top of every dashboard page.
 */
export function PageHeader({ title, backHref, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            ← Back
          </Link>
        )}
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      </div>

      {action && (
        <Link
          href={action.href}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
