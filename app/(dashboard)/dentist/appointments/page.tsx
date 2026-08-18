import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layouts/PageHeader";
import { AppointmentFilters } from "@/components/dentist/AppointmentFilters";
import { AppointmentsView } from "@/components/dentist/AppointmentsView";
import { NewInquiryButton } from "@/components/dentist/NewInquiryButton";
import { AppointmentFormDialog } from "@/components/shared/AppointmentFormDialog";
import { QuickFilters } from "@/components/shared/QuickFilters";
import { appointmentsQuickFilters } from "@/lib/quick-filters";
import { getClinicTimezone } from "@/lib/clinic/config";
import { getTodayInTimezone } from "@/lib/utils";
import { Plus } from "lucide-react";

export const metadata: Metadata = {
  title: "Appointments",
};

interface Props {
  searchParams: Promise<{
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    timeFrom?: string;
    timeTo?: string;
    page?: string;
    /** Marker for the explicit "All" chip; skips the default-to-Upcoming redirect. */
    all?: string;
  }>;
}

/**
 * /dentist/appointments
 *
 * Server Component shell — resolves clinic timezone + today (cheap, cached
 * session) and renders the filter bar. The appointment list itself is rendered
 * by AppointmentsView, a Client Component backed by TanStack Query, so return
 * navigation is instant from cache. `getAppointments` remains the source of
 * truth and all mutations stay on the existing Server Actions.
 */
export default async function DentistAppointmentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 20;

  const clinicTimezone = await getClinicTimezone();
  const today = getTodayInTimezone(clinicTimezone);

  // Default the tab to "Upcoming": an unfiltered visit (fresh navigation from the
  // sidebar) redirects to today-onward. "All" carries an explicit `all=1` marker,
  // so this only fires on a genuinely empty URL and never traps the All chip.
  const hasAnyFilter =
    Boolean(params.status) ||
    Boolean(params.search) ||
    Boolean(params.dateFrom) ||
    Boolean(params.dateTo) ||
    Boolean(params.timeFrom) ||
    Boolean(params.timeTo) ||
    params.all === "1";
  if (!hasAnyFilter) {
    redirect(`/dentist/appointments?dateFrom=${today}`);
  }

  const quickFilters = appointmentsQuickFilters(today);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <PageHeader title="Appointments">
        <NewInquiryButton />
        <AppointmentFormDialog
          clinicToday={today}
          title="Book New Appointment"
          triggerVariant="default"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Book New Appointment
        </AppointmentFormDialog>
      </PageHeader>

      {/* Quick filters (client component, drives URL params) */}
      <Suspense>
        <QuickFilters trackKeys={quickFilters.trackKeys} chips={quickFilters.chips} />
      </Suspense>

      {/* Filters (client component, drives URL params) */}
      <Suspense>
        <AppointmentFilters
          today={today}
          initialSearch={params.search ?? ""}
          initialStatus={params.status ?? ""}
          initialDateFrom={params.dateFrom ?? ""}
          initialDateTo={params.dateTo ?? ""}
          initialTimeFrom={params.timeFrom ?? ""}
          initialTimeTo={params.timeTo ?? ""}
        />
      </Suspense>

      {/* List (client component, TanStack Query cache) */}
      <AppointmentsView
        page={page}
        limit={limit}
        clinicTimezone={clinicTimezone}
        clinicToday={today}
        search={params.search}
        status={params.status}
        dateFrom={params.dateFrom}
        dateTo={params.dateTo}
        timeFrom={params.timeFrom}
        timeTo={params.timeTo}
      />
    </div>
  );
}
