import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layouts/PageHeader";
import { AppointmentFilters } from "@/components/dentist/AppointmentFilters";
import { AppointmentsView } from "@/components/dentist/AppointmentsView";
import { NewInquiryButton } from "@/components/dentist/NewInquiryButton";
import { getClinicTimezone } from "@/lib/clinic/config";
import { getTodayInTimezone } from "@/lib/utils";

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

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Appointments"
        action={{ label: "+ Book New Appointment", href: "/dentist/appointments/new" }}
      >
        <NewInquiryButton />
      </PageHeader>

      {/* Filters (client component, drives URL params) */}
      <Suspense>
        <AppointmentFilters
          today={today}
          initialSearch={params.search ?? ""}
          initialStatus={params.status ?? ""}
          initialDateFrom={params.dateFrom ?? today}
          initialDateTo={params.dateTo ?? today}
          initialTimeFrom={params.timeFrom ?? ""}
          initialTimeTo={params.timeTo ?? ""}
        />
      </Suspense>

      {/* List (client component, TanStack Query cache) */}
      <AppointmentsView
        page={page}
        limit={limit}
        clinicTimezone={clinicTimezone}
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
