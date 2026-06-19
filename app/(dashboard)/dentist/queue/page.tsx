import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { QueueBoard } from "@/components/queue/QueueBoard";
import { getTodayQueue, getQueueMetrics } from "@/actions/queue";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Queue — DentGrow",
};

/**
 * /dentist/queue
 *
 * Server Component — live queue board for dentist.
 * Fetches initial queue data + metrics server-side to avoid loading flash.
 * Realtime updates happen client-side via useQueue hook in QueueBoard.
 *
 * Dentist can:
 * - View full queue
 * - Advance queue (mark done + call next)
 * - Skip patients
 */
export default async function DentistQueuePage() {
  // Fetch initial data in parallel
  const [queueResult, metricsResult] = await Promise.all([
    getTodayQueue(),
    getQueueMetrics(),
  ]);

  const initialQueue = queueResult.data ?? [];
  const metrics = metricsResult.data ?? undefined;

  // Resolve clinic_id for Realtime subscription (passed to QueueBoard → useQueue)
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
    <div className="p-6 space-y-6">
      <PageHeader title="Queue" />
      <QueueBoard
        initialQueue={initialQueue}
        clinicId={clinicId}
        metrics={metrics}
      />
    </div>
  );
}
