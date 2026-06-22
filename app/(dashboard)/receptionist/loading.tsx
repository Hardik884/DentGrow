import { Skeleton } from "@/components/ui/skeleton";

export default function ReceptionistDashboardLoading() {
  return (
    <div className="p-6 max-w-screen-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-8 w-40 rounded-lg" />
      </div>

      {/* Search bar */}
      <Skeleton className="h-10 w-full max-w-lg rounded-lg" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Today's appointments */}
          <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E4E4E7]">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24 mt-1" />
            </div>
            <div className="divide-y divide-[#F4F4F5]">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-5 py-4 flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-7 w-24 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Queue widget */}
        <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E4E4E7]">
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="divide-y divide-[#F4F4F5]">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-5 py-3.5 flex items-center gap-3">
                <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
