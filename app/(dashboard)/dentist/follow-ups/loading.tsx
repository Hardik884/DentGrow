import { Skeleton } from "@/components/ui/skeleton";

export default function FollowUpsLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>

      {/* Filter bar skeleton */}
      <div className="bg-surface border border-border rounded-xl px-5 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-9 w-full max-w-md rounded-lg" />
        <div className="flex flex-wrap gap-4">
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      <Skeleton className="h-4 w-28" />

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-muted bg-background">
                {["Patient", "Type", "Due Date", "Notes", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left">
                    <Skeleton className="h-3 w-16" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-muted">
              {Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-36" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-6 w-20 rounded-full" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
