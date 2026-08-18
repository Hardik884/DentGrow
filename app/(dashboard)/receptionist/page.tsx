import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { TodayAppointmentList } from "@/components/receptionist/TodayAppointmentList";
import { QueueBoard } from "@/components/queue/QueueBoard";
import { ClinicDentistName } from "@/components/shared/ClinicDentistName";
import { NewInquiryButton } from "@/components/dentist/NewInquiryButton";
import { AppointmentFormDialog } from "@/components/shared/AppointmentFormDialog";
import { getTodayQueue, getQueueMetrics } from "@/actions/queue";
import { createServerClient } from "@/lib/supabase/server";
import { Plus } from "lucide-react";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * /receptionist
 *
 * Redesigned receptionist dashboard — single operational workspace.
 * Embeds complete queue functionality and today's appointments.
 * No payment widgets (payments moved to dedicated conditional page).
 * No patient search widget (search available on Patients page).
 */
export default async function ReceptionistDashboardPage() {
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;
  const { data: { user } } = await supabase.auth.getUser();

  // Resolve profile, queue, and metrics in parallel — no sequential waterfall.
  const [profileRes, queueResult, metricsResult] = await Promise.all([
    user
      ? db.from("profiles").select("clinic_id").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
    getTodayQueue(),
    getQueueMetrics(),
  ]);

  const clinicId = (profileRes.data as { clinic_id: string } | null)?.clinic_id ?? "";
  const initialQueue = queueResult.data ?? [];
  const metrics = metricsResult.data ?? undefined;

  return (
    <div className="p-6 max-w-7xl">
      <PageHeader
        title="Today's Dashboard"
        description="Front-desk operational workspace"
      >
        <NewInquiryButton />
        <AppointmentFormDialog title="Book New Appointment" triggerVariant="default">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Book New Appointment
        </AppointmentFormDialog>
      </PageHeader>

      {/* Clinic dentist name (data-driven from clinics.dentist_name) */}
      <ClinicDentistName />

      <div className="space-y-6 mt-4">
        {/* Today's Appointments */}
        <section>
          <h2 className="text-base font-semibold text-text-primary mb-3">Today&apos;s Appointments</h2>
          <TodayAppointmentList />
        </section>

        {/* Live Queue */}
        <section>
          <h2 className="text-base font-semibold text-text-primary mb-3">Live Queue</h2>
          <QueueBoard initialQueue={initialQueue} clinicId={clinicId} metrics={metrics} />
        </section>
      </div>
    </div>
  );
}

