import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/**
 * Dentist dashboard skeleton — shown while the server fetches KPIs,
 * queue data, and appointments. Prevents blank screen on navigation.
 */
export default function DentistDashboardLoading() {
  return (
    <div className="p-6 max-w-screen-xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24 mt-1" />
            </div>
            <div className="divide-y divide-surface-muted">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-5 py-4 flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="divide-y divide-surface-muted">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-5 py-3.5 flex items-center gap-3">
                  <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
