import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/**
 * Mirrors the real page's rhythm — status banner, two observation sections,
 * then the metric grid — so the layout does not jump when data arrives.
 */
export default function BusinessBrainLoading() {
  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      {/* Header */}
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Status banner */}
      <div className="bg-white border border-[#E4E4E7] rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3.5">
          <Skeleton className="h-2.5 w-2.5 rounded-full mt-1.5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="pt-4 border-t border-[#F4F4F5] flex gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>

      {/* Signals */}
      <section className="space-y-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="bg-white border border-[#E4E4E7] rounded-xl divide-y divide-[#F4F4F5]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-start gap-3">
              <Skeleton className="h-1.5 w-1.5 rounded-full mt-1.5" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Diagnoses */}
      <section className="space-y-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-80" />
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white border border-[#E4E4E7] rounded-xl p-5 space-y-2.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3 w-52" />
          </div>
        ))}
      </section>

      {/* Metrics */}
      <section className="space-y-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-56" />
        </div>
        {Array.from({ length: 2 }).map((_, g) => (
          <div key={g} className="space-y-2.5">
            <Skeleton className="h-3 w-20" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
