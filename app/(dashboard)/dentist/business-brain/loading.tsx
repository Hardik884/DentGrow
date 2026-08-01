import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the redesigned page structure — status banner with metrics,
 * then problem cards — so the layout does not jump when data arrives.
 */
export default function BusinessBrainLoading() {
  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      {/* Header */}
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Status banner with headline metrics */}
      <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-start gap-3.5">
            <Skeleton className="h-2.5 w-2.5 rounded-full mt-1.5" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
          </div>
        </div>
        <div className="border-t border-[#F4F4F5] px-6 py-4 bg-[#FAFAFA]/50">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Focus cards */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden flex">
          <div className="w-1 shrink-0 bg-[#E4E4E7]" />
          <div className="flex-1 p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <Skeleton className="h-5 w-48" />
              <div className="text-right space-y-1">
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-3 w-16 ml-auto" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-14 rounded" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </div>
      ))}

      {/* Collapsed sections */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="bg-white border border-[#E4E4E7] rounded-xl px-5 py-4">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      ))}
    </div>
  );
}
