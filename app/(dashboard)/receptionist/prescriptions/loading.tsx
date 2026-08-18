import { PageHeader } from "@/components/layouts/PageHeader";
import { ListTableSkeleton } from "@/components/shared/ListTableSkeleton";

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Prescription History"
        description="View and print past prescriptions for patient inquiries"
      />
      <div className="bg-surface border border-border rounded-xl px-5 py-4 space-y-4">
        <div className="h-8 w-32 bg-surface-muted rounded animate-pulse" />
        <div className="h-9 w-full max-w-md bg-surface-muted rounded animate-pulse" />
        <div className="flex gap-4">
          <div className="h-9 w-40 bg-surface-muted rounded animate-pulse" />
          <div className="h-9 w-40 bg-surface-muted rounded animate-pulse" />
          <div className="h-9 w-40 bg-surface-muted rounded animate-pulse" />
        </div>
      </div>
      <p className="text-sm text-text-secondary">Loading prescriptions…</p>
      <ListTableSkeleton />
    </div>
  );
}
