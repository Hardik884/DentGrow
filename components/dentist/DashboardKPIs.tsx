import { getDashboardKPIs } from "@/lib/analytics/queries";
import { createServerClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CalendarDays,
  UserCheck,
  TrendingUp,
  Clock,
  AlertCircle,
  DollarSign,
  UserPlus,
  Footprints,
} from "lucide-react";

interface KPICardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  sub?: string;
}

function KPICard({ label, value, icon, sub }: KPICardProps) {
  return (
    <div className="bg-white border border-[#E4E4E7] rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#71717A] tracking-wide">{label}</p>
        <div className="h-7 w-7 rounded-lg bg-[#F4F4F5] flex items-center justify-center text-[#71717A]">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-2xl font-semibold text-[#09090B] tracking-tight">{value}</p>
        {sub && <p className="text-xs text-[#71717A] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/**
 * DashboardKPIs — today's KPI cards for the dentist dashboard.
 */
export async function DashboardKPIs() {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profileData } = user
    ? await supabase.from("profiles").select("clinic_id").eq("id", user.id).single()
    : { data: null };

  const profile = profileData as { clinic_id: string } | null;
  const clinicId = profile?.clinic_id ?? "";

  let timezone = "UTC";
  if (clinicId) {
    const { data: settings } = await supabase
      .from("clinic_settings")
      .select("timezone")
      .eq("clinic_id", clinicId)
      .maybeSingle();
    timezone = (settings as { timezone?: string } | null)?.timezone ?? "UTC";
  }

  const kpis = await getDashboardKPIs(
    supabase as unknown as SupabaseClient,
    clinicId,
    timezone
  );

  const completionPct = Math.round(kpis.completionRateToday);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <KPICard
        label="Appointments"
        value={kpis.totalAppointmentsToday.toString()}
        icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden />}
        sub="Today"
      />
      <KPICard
        label="Patients Seen"
        value={kpis.seenPatientsToday.toString()}
        icon={<UserCheck className="h-3.5 w-3.5" aria-hidden />}
        sub="Completed"
      />
      <KPICard
        label="Completion Rate"
        value={`${completionPct}%`}
        icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden />}
        sub={kpis.totalAppointmentsToday > 0 ? `${kpis.seenPatientsToday} of ${kpis.totalAppointmentsToday}` : undefined}
      />
      <KPICard
        label="Waiting Now"
        value={kpis.waitingPatients.toString()}
        icon={<Clock className="h-3.5 w-3.5" aria-hidden />}
        sub="In queue"
      />
      <KPICard
        label="No-Shows"
        value={kpis.noShowsToday.toString()}
        icon={<AlertCircle className="h-3.5 w-3.5" aria-hidden />}
        sub="Today"
      />
      <KPICard
        label="Revenue"
        value={formatCurrency(kpis.revenueToday)}
        icon={<DollarSign className="h-3.5 w-3.5" aria-hidden />}
        sub="Today"
      />
      <KPICard
        label="New Patients"
        value={kpis.newPatientsToday.toString()}
        icon={<UserPlus className="h-3.5 w-3.5" aria-hidden />}
        sub="Registered today"
      />
      <KPICard
        label="Walk-ins"
        value={kpis.walkInsToday.toString()}
        icon={<Footprints className="h-3.5 w-3.5" aria-hidden />}
        sub="Today"
      />
    </div>
  );
}
