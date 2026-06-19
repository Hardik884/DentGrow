import { Suspense } from "react";
import { DateRangeFilter } from "@/components/analytics/DateRangeFilter";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

/**
 * Analytics layout — wraps the single analytics dashboard.
 * Renders the page header and date range filter.
 * Date range travels as URL search params (?from=&to=) — no client state.
 */
export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Clinic performance overview. Dentist access only.
          </p>
        </div>
        <Suspense fallback={null}>
          <DateRangeFilter />
        </Suspense>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-24">
            <LoadingSpinner size="lg" label="Loading analytics…" />
          </div>
        }
      >
        {children}
      </Suspense>
    </div>
  );
}
