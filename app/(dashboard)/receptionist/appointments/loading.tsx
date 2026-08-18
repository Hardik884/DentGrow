import { Skeleton } from "@/components/ui/skeleton";

export default function ReceptionistAppointmentsLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-40 rounded-lg" />
      </div>
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24 mt-1" />
        </div>
        <div className="divide-y divide-surface-muted">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-7 w-24 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
