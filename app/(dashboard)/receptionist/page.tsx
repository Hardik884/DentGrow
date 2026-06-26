import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { TodayAppointmentList } from "@/components/receptionist/TodayAppointmentList";
import { QueueWidget } from "@/components/queue/QueueWidget";
import { PendingPaymentsList } from "@/components/receptionist/PendingPaymentsList";
import { PatientSearchBar } from "@/components/receptionist/PatientSearchBar";
import { ClinicDentistName } from "@/components/shared/ClinicDentistName";
import { getTodayQueue } from "@/actions/queue";
import { createServerClient } from "@/lib/supabase/server";
import { Plus } from "lucide-react";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function ReceptionistDashboardPage() {
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;
  const { data: { user } } = await supabase.auth.getUser();

  // Resolve profile and queue in parallel — no sequential waterfall.
  const [profileRes, queueResult] = await Promise.all([
    user
      ? db.from("profiles").select("clinic_id").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
    getTodayQueue(),
  ]);

  const clinicId = (profileRes.data as { clinic_id: string } | null)?.clinic_id ?? "";
  const initialQueue = queueResult.data ?? [];

  return (
    <div className="p-6 max-w-screen-xl">
      <PageHeader
        title="Dashboard"
        description="Front-desk overview for today"
        action={{ label: "New Appointment", href: "/receptionist/appointments/new", icon: <Plus className="h-3.5 w-3.5" /> }}
      />

      {/* Clinic dentist name (data-driven from clinics.dentist_name) */}
      <ClinicDentistName />

      {/* Patient Search — prominent for receptionist workflow */}
      <div className="mb-4">
        <PatientSearchBar />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <TodayAppointmentList />
          <PendingPaymentsList />
        </div>

        <div>
          <QueueWidget
            initialQueue={initialQueue}
            clinicId={clinicId}
            queueHref="/receptionist/queue"
          />
        </div>
      </div>
    </div>
  );
}

