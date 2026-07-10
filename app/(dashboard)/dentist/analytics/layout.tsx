import { Suspense } from "react";
import { DateRangeFilter } from "@/components/analytics/DateRangeFilter";
import { AnalyticsQuickFilters } from "@/components/analytics/AnalyticsQuickFilters";
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
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#09090B] tracking-tight">Analytics</h1>
          <p className="text-sm text-[#71717A] mt-0.5">
            Clinic performance overview
          </p>
        </div>
        <Suspense fallback={null}>
          <DateRangeFilter />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <AnalyticsQuickFilters />
      </Suspense>

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

