import { PageHeader } from "@/components/layouts/PageHeader";
import { ListTableSkeleton } from "@/components/shared/ListTableSkeleton";

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Prescription History"
        description="View and print past prescriptions for patient inquiries"
      />
      <div className="bg-white border border-[#E3E9E6] rounded-xl px-5 py-4 space-y-4">
        <div className="h-8 w-32 bg-[#EEF2F0] rounded animate-pulse" />
        <div className="h-9 w-full max-w-md bg-[#EEF2F0] rounded animate-pulse" />
        <div className="flex gap-4">
          <div className="h-9 w-40 bg-[#EEF2F0] rounded animate-pulse" />
          <div className="h-9 w-40 bg-[#EEF2F0] rounded animate-pulse" />
          <div className="h-9 w-40 bg-[#EEF2F0] rounded animate-pulse" />
        </div>
      </div>
      <p className="text-sm text-[#737A76]">Loading prescriptions…</p>
      <ListTableSkeleton />
    </div>
  );
}
