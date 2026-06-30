import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layouts/PageHeader";
import { TreatmentFilters } from "@/components/dentist/TreatmentFilters";
import { TreatmentsView } from "@/components/dentist/TreatmentsView";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Treatments — DentGrow",
};

interface Props {
  searchParams: Promise<{
    status?: string;
    search?: string;
    treatmentType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  }>;
}

/**
 * /dentist/treatments
 *
 * Server Component shell — resolves today's date (clinic timezone) for the
 * filter default and renders the filter bar. The treatment list is rendered by
 * TreatmentsView, a Client Component backed by TanStack Query, so return
 * navigation is instant from cache. `getAllTreatments` remains the source of
 * truth and mutations stay on the existing Server Actions.
 */
export default async function DentistTreatmentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 20;

  // Resolve today's date for the filter default (clinic timezone).
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;
  const { data: { user } } = await supabase.auth.getUser();

  let today = new Date().toISOString().split("T")[0];

  if (user) {
    const { data: profile } = await db
      .from("profiles")
      .select("clinic_id")
      .eq("id", user.id)
      .single();
    const clinicId = (profile as { clinic_id: string } | null)?.clinic_id;
    if (clinicId) {
      const { data: settings } = await db
        .from("clinic_settings")
        .select("timezone")
        .eq("clinic_id", clinicId)
        .maybeSingle();
      const tz = (settings as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";
      today = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Treatments" />

      {/* Filters (client component, drives URL params) */}
      <Suspense>
        <TreatmentFilters
          today={today}
          initialSearch={params.search ?? ""}
          initialStatus={params.status ?? ""}
          initialTreatmentType={params.treatmentType ?? ""}
          initialDateFrom={params.dateFrom ?? ""}
          initialDateTo={params.dateTo ?? ""}
        />
      </Suspense>

      {/* List (client component, TanStack Query cache) */}
      <TreatmentsView
        page={page}
        limit={limit}
        search={params.search}
        status={params.status}
        treatmentType={params.treatmentType}
        dateFrom={params.dateFrom}
        dateTo={params.dateTo}
      />
    </div>
  );
}
