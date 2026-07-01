import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { QueueBoard } from "@/components/queue/QueueBoard";
import { getTodayQueue, getQueueMetrics } from "@/actions/queue";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Queue",
};

/**
 * /receptionist/queue
 *
 * Server Component — live queue board for receptionist.
 * Fetches initial queue data + metrics server-side.
 * Realtime updates via useQueue hook.
 */
export default async function ReceptionistQueuePage() {
  // Resolve session + queue + metrics in parallel — no sequential waterfall.
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;
  const { data: { user } } = await supabase.auth.getUser();

  const [queueResult, metricsResult, profileRes] = await Promise.all([
    getTodayQueue(),
    getQueueMetrics(),
    user
      ? db.from("profiles").select("clinic_id").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  const initialQueue = queueResult.data ?? [];
  const metrics = metricsResult.data ?? undefined;
  const clinicId = (profileRes.data as { clinic_id: string } | null)?.clinic_id ?? "";

  return (
    <div className="p-6 max-w-screen-xl">
      <PageHeader title="Queue" description="Live waiting room — real-time updates" />
      <QueueBoard initialQueue={initialQueue} clinicId={clinicId} metrics={metrics} />
    </div>
  );
}

