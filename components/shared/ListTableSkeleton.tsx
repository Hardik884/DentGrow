import { Skeleton } from "@/components/ui/skeleton";

/**
 * ListTableSkeleton
 *
 * Initial-load placeholder for the TanStack Query list pages. Shown ONLY on
 * the very first fetch when no cached data exists yet. On return navigation
 * (cache hit) or during pagination/filtering (keepPreviousData) the real /
 * previous rows are shown instead — never this skeleton — so the user never
 * sees a full-page spinner flash.
 */
export function ListTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="bg-white border border-[#E3E9E6] rounded-xl overflow-hidden">
      <div className="divide-y divide-[#EEF2F0]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-20 rounded-full ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
