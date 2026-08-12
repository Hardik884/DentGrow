import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layouts/PageHeader";
import { FollowUpFilters } from "@/components/follow-ups/FollowUpFilters";
import { FollowUpsView } from "@/components/follow-ups/FollowUpsView";
import { FollowUpFormDialog } from "@/components/follow-ups/FollowUpFormDialog";
import { QuickFilters } from "@/components/shared/QuickFilters";
import { followUpsQuickFilters } from "@/lib/quick-filters";
import { getClinicTimezone } from "@/lib/clinic/config";
import { getTodayInTimezone } from "@/lib/utils";
import { Plus } from "lucide-react";

export const metadata: Metadata = {
  title: "Follow-up Appointments",
};

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    confirmation?: string;
    treatmentType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  }>;
}

/**
 * /dentist/follow-ups
 *
 * Server Component shell — renders the filter bar. The follow-up list is
 * rendered by FollowUpsView, a Client Component backed by TanStack Query, so
 * return navigation is instant from cache. `getAllFollowUps` remains the
 * source of truth and mutations stay on the existing Server Actions.
 */
export default async function DentistFollowUpsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 20;

  const clinicTimezone = await getClinicTimezone();
  const today = getTodayInTimezone(clinicTimezone);
  const quickFilters = followUpsQuickFilters(today);

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Follow-up Appointments">
        <FollowUpFormDialog
          hideRelatedFields={false}
          title="New Follow-up Appointment"
          triggerVariant="default"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New Follow-up Appointment
        </FollowUpFormDialog>
      </PageHeader>

      {/* Quick filters */}
      <Suspense>
        <QuickFilters trackKeys={quickFilters.trackKeys} chips={quickFilters.chips} />
      </Suspense>

      {/* Filters (client component, drives URL params) */}
      <Suspense>
        <FollowUpFilters
          initialSearch={params.search ?? ""}
          initialStatus={params.status ?? ""}
          initialTreatmentType={params.treatmentType ?? ""}
          initialDateFrom={params.dateFrom ?? ""}
          initialDateTo={params.dateTo ?? ""}
        />
      </Suspense>

      {/* List (client component, TanStack Query cache) */}
      <FollowUpsView
        page={page}
        limit={limit}
        search={params.search}
        status={params.status}
        confirmation={params.confirmation}
        treatmentType={params.treatmentType}
        dateFrom={params.dateFrom}
        dateTo={params.dateTo}
        clinicToday={today}
      />
    </div>
  );
}
