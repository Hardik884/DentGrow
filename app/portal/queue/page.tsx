import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getTodayQueue, getQueueStatus } from "@/actions/queue";
import { QueuePositionCard } from "@/components/queue/QueuePositionCard";

export const metadata: Metadata = {
  title: "My Queue Position",
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
 * 4. The patient's own queue entry (RLS scopes this to a single row).
 *    Position context (patientsAhead, currentQueueNumber, estimated wait)
 *    comes from getQueueStatus() which uses an aggregated count.
 */
export default async function PortalQueuePage() {
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/patient/login");

  // Resolve portal link → patient_id + clinic_id
  const { data: linkData } = await db
    .from("patient_portal_links")
    .select("patient_id, patients!inner(clinic_id)")
    .eq("user_id", user.id)
    .single();

  if (!linkData) redirect("/portal/setup");

  const link = linkData as {
    patient_id: string;
    patients: { clinic_id: string } | { clinic_id: string }[] | null;
  };

  const patientId = link.patient_id;
  const clinicId = Array.isArray(link.patients)
    ? link.patients[0]?.clinic_id ?? ""
    : link.patients?.clinic_id ?? "";

  // Fetch clinic settings for fallback average duration + chair count
  const { data: settingsData } = await db
    .from("clinic_settings")
    .select("average_appointment_duration, chair_count")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  const settings = settingsData as
    | { average_appointment_duration?: number; chair_count?: number }
    | null;
  const averageAppointmentDuration = settings?.average_appointment_duration ?? 30;
  // Active chairs — the client's brief pre-fetch fallback estimate (before
  // getQueueStatus's server value lands) must divide by this too (audit B3).
  const chairCount = Math.max(1, settings?.chair_count ?? 1);

  // For portal users, getTodayQueue returns just the patient's own entry.
  // We pair it with getQueueStatus, which reports patientsAhead + estimated
  // wait via a service-role aggregate so the count is accurate even though
  // RLS hides other patients' rows from this user.
  const [queueResult, statusResult] = await Promise.all([
    getTodayQueue(),
    getQueueStatus(patientId),
  ]);

  const initialQueue = queueResult.data ?? [];
  const status = statusResult.data ?? {
    position: null,
    patientsAhead: 0,
    estimatedWaitMinutes: 0,
    currentQueueNumber: null,
    myStatus: null,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Your Queue Position</h1>

      <QueuePositionCard
        patientId={patientId}
        initialQueue={initialQueue}
        clinicId={clinicId}
        averageAppointmentDuration={averageAppointmentDuration}
        chairCount={chairCount}
        initialStatus={status}
      />

      <div className="bg-surface border rounded-lg p-4 text-sm text-text-secondary space-y-1">
        <p className="font-medium text-text-primary">What to expect</p>
        <ul className="space-y-1 text-text-secondary list-disc list-inside">
          <li>Estimated wait times are based on appointment durations</li>
          <li>Your position updates automatically in real time</li>
          <li>You will be called when it&apos;s your turn</li>
        </ul>
      </div>
    </div>
  );
}

