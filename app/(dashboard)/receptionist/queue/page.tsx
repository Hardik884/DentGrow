import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { QueueBoard } from "@/components/queue/QueueBoard";
import { getTodayQueue, getQueueMetrics } from "@/actions/queue";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Queue — DentGrow",
};

/**
 * /receptionist/queue
 *
 * Server Component — live queue board for receptionist.
 * Fetches initial queue data + metrics server-side.
 * Realtime updates via useQueue hook.
 *
 * Receptionist can:
 * - Check in patients (from appointment detail page)
 * - View full queue with waiting + in_progress + completed
 * - Advance queue / skip patients
 */
export default async function ReceptionistQueuePage() {
  const [queueResult, metricsResult] = await Promise.all([
    getTodayQueue(),
    getQueueMetrics(),
  ]);

  const initialQueue = queueResult.data ?? [];
  const metrics = metricsResult.data ?? undefined;

  // Resolve clinic_id for Realtime subscription
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let clinicId = "";
  if (user) {
    const { data: profile } = await db
      .from("profiles")
      .select("clinic_id")
      .eq("id", user.id)
      .single();
    clinicId = (profile as { clinic_id: string } | null)?.clinic_id ?? "";
  }

  return (
    <div className="p-6 max-w-screen-xl">
      <PageHeader title="Queue" description="Live waiting room — real-time updates" />
      <QueueBoard initialQueue={initialQueue} clinicId={clinicId} metrics={metrics} />
    </div>
  );
}

