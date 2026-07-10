"use client";

/**
 * AnalyticsQuickFilters
 *
 * Quick date-range chips for the analytics dashboard. Sets the `from`/`to`
 * URL params consumed by the analytics page (same params the DateRangeFilter
 * writes), so it reuses the existing server-driven data fetch. "Today" is
 * derived client-side, which is sufficient for quick-range selection.
 */

import { useMemo } from "react";
import { QuickFilters } from "@/components/shared/QuickFilters";
import { analyticsQuickFilters } from "@/lib/quick-filters";

export function AnalyticsQuickFilters() {
  const config = useMemo(() => {
    const today = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return analyticsQuickFilters(today);
  }, []);

  return <QuickFilters trackKeys={config.trackKeys} chips={config.chips} />;
}
