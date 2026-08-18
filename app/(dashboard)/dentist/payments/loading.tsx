import { Skeleton } from "@/components/ui/skeleton";

export default function PaymentsLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>

      {/* Revenue today card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-4 space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      {/* Outstanding balances table */}
      <div className="bg-white border border-[#E3E9E6] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E3E9E6]">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="divide-y divide-[#EEF2F0]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-7 w-24 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
