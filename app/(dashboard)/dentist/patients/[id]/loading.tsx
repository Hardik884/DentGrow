import { Skeleton } from "@/components/ui/skeleton";

export default function PatientProfileLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* Back + header */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-6 w-32" />
      </div>

      {/* Profile header card */}
      <div className="bg-white border border-[#E3E9E6] rounded-xl overflow-hidden">
        <div className="px-6 py-5 flex items-start gap-4">
          <Skeleton className="h-12 w-12 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-36" />
            <div className="flex gap-4">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        </div>
        <div className="border-t border-[#E3E9E6]" />
        <div className="grid grid-cols-4 divide-x divide-[#EEF2F0]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 py-4 space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-t-lg" />
        ))}
      </div>

      {/* Tab content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white border border-[#E3E9E6] rounded-xl p-4 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="bg-white border border-[#E3E9E6] rounded-xl p-4 space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
