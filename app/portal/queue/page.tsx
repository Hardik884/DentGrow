import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getTodayQueue } from "@/actions/queue";
import { QueuePositionCard } from "@/components/queue/QueuePositionCard";

export const metadata: Metadata = {
  title: "My Queue Position — DentGrow",
};

/**
 * /portal/queue
 *
 * Server Component — live queue position for the portal patient.
 *
 * Resolves:
 * 1. patient_id from portal link
 * 2. clinic_id for Realtime subscription
 * 3. average_appointment_duration from clinic_settings (fallback)
 * 4. Full today's queue for initial render (Realtime updates via useQueue)
 *
 * The queue shows the patient's position, patients ahead, estimated wait,
 * and which number is currently being seen.
 */
export default async function PortalQueuePage() {
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Resolve portal link → patient_id + clinic_id
  const { data: linkData } = await db
    .from("patient_portal_links")
    .select("patient_id, patient:patients(clinic_id)")
    .eq("user_id", user.id)
    .single();

  if (!linkData) redirect("/portal/setup");

  const link = linkData as {
    patient_id: string;
    patient: { clinic_id: string } | null;
  };

  const patientId = link.patient_id;
  const clinicId = link.patient?.clinic_id ?? "";

  // Fetch clinic settings for fallback average duration
  const { data: settingsData } = await db
    .from("clinic_settings")
    .select("average_appointment_duration")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  const averageAppointmentDuration =
    (settingsData as { average_appointment_duration?: number } | null)
      ?.average_appointment_duration ?? 30;

  // Fetch today's full queue for initial render (includes all patients for position context)
  // Note: for portal users, RLS limits getTodayQueue to show patient-role data.
  // We use a broader fetch here via the server-side Supabase client (anon key + user session)
  // which respects RLS. The patient can see the queue count but not other patients' names.
  const queueResult = await getTodayQueue();
  const initialQueue = queueResult.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Your Queue Position</h1>

      <QueuePositionCard
        patientId={patientId}
        initialQueue={initialQueue}
        clinicId={clinicId}
        averageAppointmentDuration={averageAppointmentDuration}
      />

      <div className="bg-white border rounded-lg p-4 text-sm text-gray-600 space-y-1">
        <p className="font-medium text-gray-900">What to expect</p>
        <ul className="space-y-1 text-gray-500 list-disc list-inside">
          <li>Estimated wait times are based on appointment durations</li>
          <li>Your position updates automatically in real time</li>
          <li>You will be called when it&apos;s your turn</li>
        </ul>
      </div>
    </div>
  );
}
