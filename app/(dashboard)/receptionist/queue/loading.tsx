import { Skeleton } from "@/components/ui/skeleton";

export default function ReceptionistQueueLoading() {
  return (
    <div className="p-6 max-w-screen-xl space-y-4">
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-[#E4E4E7] rounded-xl p-4 space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>
      <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E4E4E7]">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="divide-y divide-[#F4F4F5]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-full shrink-0" />
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-7 w-20 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
