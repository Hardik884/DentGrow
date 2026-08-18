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

type KPITone = "neutral" | "mint" | "amber" | "cool";

const TONE_STYLES: Record<KPITone, { card: string; iconBg: string; iconText: string }> = {
  neutral: { card: "bg-white border-[#E3E9E6]", iconBg: "bg-[#EEF2F0]", iconText: "text-[#737A76]" },
  mint:    { card: "bg-[#F6FBF9] border-[#DCEEE8]", iconBg: "bg-[#E8F4F0]", iconText: "text-[#0D6B5E]" },
  amber:   { card: "bg-[#FFFCF6] border-[#F5E6C6]", iconBg: "bg-[#FEF3E2]", iconText: "text-[#B45309]" },
  cool:    { card: "bg-[#F7F9FB] border-[#E1E7ED]", iconBg: "bg-[#EBF1F7]", iconText: "text-[#3F5872]" },
};

interface KPICardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  sub?: string;
  tone?: KPITone;
}

function KPICard({ label, value, icon, sub, tone = "neutral" }: KPICardProps) {
  const styles = TONE_STYLES[tone];
  return (
    <div
      className={`rounded-xl border p-5 space-y-3 shadow-[0_1px_2px_rgba(21,25,24,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_-2px_rgba(21,25,24,0.06)] ${styles.card}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#737A76] tracking-wide">{label}</p>
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${styles.iconBg} ${styles.iconText}`}>
          {icon}
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-[#151918] tracking-tight leading-none">{value}</p>
        {sub && <p className="text-xs text-[#737A76] mt-1.5">{sub}</p>}
      </div>
    </div>
  );
}

interface DashboardKPIsProps {
  /** Pre-resolved clinic ID — passed from the page to avoid a redundant auth lookup. */
  clinicId?: string;
  /** Pre-resolved clinic timezone — passed from the page to avoid a redundant settings lookup. */
  timezone?: string;
}

/**
 * DashboardKPIs — today's KPI cards for the dentist dashboard.
 *
 * When clinicId + timezone are passed as props (from the dashboard page that
 * already resolved them), no additional DB queries are fired. Falls back to
 * its own resolution for standalone use cases.
 */
export async function DashboardKPIs({ clinicId: propClinicId, timezone: propTimezone }: DashboardKPIsProps = {}) {
  const supabase = await createServerClient();

  let clinicId = propClinicId ?? "";
  let timezone = propTimezone ?? "Asia/Kolkata";

  // Only query if not provided — avoids duplicate auth+profile+settings lookups
  // when the parent page already resolved these values.
  if (!clinicId) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profileData } = user
      ? await supabase.from("profiles").select("clinic_id").eq("id", user.id).single()
      : { data: null };

    const profile = profileData as { clinic_id: string } | null;
    clinicId = profile?.clinic_id ?? "";

    if (clinicId && !propTimezone) {
      const { data: settings } = await supabase
        .from("clinic_settings")
        .select("timezone")
        .eq("clinic_id", clinicId)
        .maybeSingle();
      timezone = (settings as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";
    }
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
        tone="mint"
      />
      <KPICard
        label="Completion Rate"
        value={`${completionPct}%`}
        icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden />}
        sub={kpis.totalAppointmentsToday > 0 ? `${kpis.seenPatientsToday} of ${kpis.totalAppointmentsToday}` : undefined}
        tone="cool"
      />
      <KPICard
        label="Waiting Now"
        value={kpis.waitingPatients.toString()}
        icon={<Clock className="h-3.5 w-3.5" aria-hidden />}
        sub="In queue"
        tone={kpis.waitingPatients > 0 ? "amber" : "neutral"}
      />
      <KPICard
        label="No-Shows"
        value={kpis.noShowsToday.toString()}
        icon={<AlertCircle className="h-3.5 w-3.5" aria-hidden />}
        sub="Today"
        tone={kpis.noShowsToday > 0 ? "amber" : "neutral"}
      />
      <KPICard
        label="Revenue"
        value={formatCurrency(kpis.revenueToday)}
        icon={<DollarSign className="h-3.5 w-3.5" aria-hidden />}
        sub="Today"
        tone="mint"
      />
      <KPICard
        label="New Patients"
        value={kpis.newPatientsToday.toString()}
        icon={<UserPlus className="h-3.5 w-3.5" aria-hidden />}
        sub="Registered today"
        tone="cool"
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
