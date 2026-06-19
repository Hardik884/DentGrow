import { getDashboardKPIs } from "@/lib/analytics/queries";
import { createServerClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * DashboardKPIs
 *
 * Server Component — today's KPI cards on the dentist dashboard.
 * Fetches data from lib/analytics/queries.ts → getDashboardKPIs().
 * All metrics are scoped to today + clinic_id from session.
 */
export async function DashboardKPIs() {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profileData } = user
    ? await supabase.from("profiles").select("clinic_id").eq("id", user.id).single()
    : { data: null };

  const profile = profileData as { clinic_id: string } | null;

  const clinicId = profile?.clinic_id ?? "";
  const kpis = await getDashboardKPIs(supabase as unknown as SupabaseClient, clinicId);

  const cards = [
    { label: "Appointments Today",  value: kpis.totalAppointmentsToday.toString() },
    { label: "Seen Today",          value: kpis.seenPatientsToday.toString() },
    { label: "Completion Rate",     value: `${Math.round(kpis.completionRateToday)}%` },
    { label: "Waiting",             value: kpis.waitingPatients.toString() },
    { label: "No-Shows",            value: kpis.noShowsToday.toString() },
    { label: "Revenue Today",       value: formatCurrency(kpis.revenueToday) },
    { label: "New Patients",        value: kpis.newPatientsToday.toString() },
    { label: "Walk-ins",            value: kpis.walkInsToday.toString() },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-white border rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {card.label}
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
