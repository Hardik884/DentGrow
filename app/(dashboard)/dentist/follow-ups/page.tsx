import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layouts/PageHeader";
import { FollowUpFilters } from "@/components/follow-ups/FollowUpFilters";
import { FollowUpsView } from "@/components/follow-ups/FollowUpsView";

export const metadata: Metadata = {
  title: "Follow-Ups",
};

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
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

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Follow-Ups"
        action={{ label: "+ New Follow-Up", href: "/dentist/follow-ups/new" }}
      />

      {/* Filters (client component, drives URL params) */}
      <Suspense>
        <FollowUpFilters
          initialSearch={params.search ?? ""}
          initialStatus={params.status ?? ""}
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
        dateFrom={params.dateFrom}
        dateTo={params.dateTo}
      />
    </div>
  );
}
