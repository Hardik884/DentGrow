import { Skeleton } from "@/components/ui/skeleton";

export default function FollowUpsLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-[#E4E4E7] rounded-xl p-4 space-y-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-12" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Overdue list */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-20" />
        <div className="bg-white border border-[#E4E4E7] rounded-xl divide-y divide-[#E4E4E7] overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-3 w-36" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
