import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function AnalyticsLoading() {
  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-48" />
      </div>

      {/* Date range filter */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      {/* Appointments section */}
      <section className="space-y-3">
        <Skeleton className="h-3.5 w-24" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div className="bg-white border border-[#E3E9E6] rounded-xl p-5">
            <Skeleton className="h-4 w-36 mb-4" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
          <div className="bg-white border border-[#E3E9E6] rounded-xl p-5">
            <Skeleton className="h-4 w-24 mb-4" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        </div>
      </section>

      {/* Patients section */}
      <section className="space-y-3">
        <Skeleton className="h-3.5 w-16" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div className="bg-white border border-[#E3E9E6] rounded-xl p-5">
            <Skeleton className="h-4 w-40 mb-4" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
          <div className="bg-white border border-[#E3E9E6] rounded-xl p-5">
            <Skeleton className="h-4 w-36 mb-4" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        </div>
      </section>

      {/* Revenue section */}
      <section className="space-y-3">
        <Skeleton className="h-3.5 w-16" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="bg-white border border-[#E3E9E6] rounded-xl p-5 mt-4">
          <Skeleton className="h-4 w-32 mb-4" />
          <Skeleton className="h-56 w-full rounded-lg" />
        </div>
      </section>
    </div>
  );
}
