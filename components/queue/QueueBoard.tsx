"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueue } from "@/hooks/useQueue";
import { advanceQueue } from "@/actions/queue";
import { QueueEntry } from "./QueueEntry";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatTimeAgo } from "@/lib/utils";
import { ListOrdered, CheckCircle2, Clock, Users } from "lucide-react";
import type { QueueEntryWithPatient } from "@/types";

interface QueueMetrics {
  totalToday: number;
  checkedInToday: number;
  waitingNow: number;
  completedToday: number;
  inProgressNow: number;
  avgWaitMinutes: number;
  /** Active chairs. Absent (older callers) defaults to 1 — unchanged behaviour. */
  chairCount?: number;
}

interface QueueBoardProps {
  initialQueue: QueueEntryWithPatient[];
  clinicId?: string;
  metrics?: QueueMetrics;
}

export function QueueBoard({ initialQueue, clinicId = "", metrics }: QueueBoardProps) {
  const router = useRouter();
  const { queue, isLoading, error } = useQueue({ clinicId, initialQueue });
  const [isPending, startTransition] = useTransition();
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const waiting = queue.filter((e) => e.status === "waiting");
  const inProgress = queue.find((e) => e.status === "in_progress");
  const completed = queue.filter((e) => e.status === "completed");
  // N active chairs treat N patients in parallel, so accumulated duration
  // ahead is shared across chairs, not served one-at-a-time (audit B3) —
  // matches the server-side estimate in actions/queue.ts's getQueueStatus.
  const chairCount = Math.max(1, metrics?.chairCount ?? 1);

  function handleAdvance() {
    setAdvanceError(null);
    startTransition(async () => {
      const result = await advanceQueue();
      if (result.error) setAdvanceError(result.error);
      else router.refresh();
    });
  }

  if (error) {
    return (
      <div className="border border-[#FECACA] rounded-xl p-4 bg-[#FEF2F2] text-sm text-[#DC2626]">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Metrics strip ──────────────────────────────────── */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricTile label="Total Today" value={metrics.totalToday} icon={<Users className="h-3.5 w-3.5" aria-hidden />} />
          <MetricTile label="Waiting" value={metrics.waitingNow} icon={<Clock className="h-3.5 w-3.5" aria-hidden />} highlight={metrics.waitingNow > 0} />
          <MetricTile label="Completed" value={metrics.completedToday} icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />} />
          <MetricTile label="Avg Wait" value={`${metrics.avgWaitMinutes}m`} icon={<Clock className="h-3.5 w-3.5" aria-hidden />} />
        </div>
      )}

      {/* ── Status bar ─────────────────────────────────────── */}
      <div className="flex items-center justify-between text-xs text-[#737A76]">
        <span>
          {waiting.length} waiting · {completed.length} completed today
        </span>
        {isLoading && <LoadingSpinner size="sm" />}
      </div>

      {/* ── Currently Seeing ──────────────────────────────── */}
      {inProgress ? (
        <div className="bg-[#F6F8F6] border border-[#E3E9E6] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#16A34A] animate-pulse" />
              <p className="text-xs font-semibold text-[#151918] uppercase tracking-wider">
                Currently Seeing
              </p>
            </div>
            <span className="text-xs text-[#737A76]">
              {inProgress.duration_minutes ?? 30} min appt
            </span>
          </div>
          <QueueEntry entry={inProgress} showActions={false} />
          <div className="pt-1">
            <Button
              onClick={handleAdvance}
              disabled={isPending}
              isLoading={isPending}
              size="sm"
            >
              Mark Done & Call Next
            </Button>
            {advanceError && (
              <p className="text-xs text-[#DC2626] mt-2" role="alert">{advanceError}</p>
            )}
          </div>
        </div>
      ) : waiting.length > 0 ? (
        <div className="bg-[#F6F8F6] border border-[#E3E9E6] rounded-xl p-4 space-y-3">
          <p className="text-sm text-[#737A76]">No one is currently being seen.</p>
          <Button
            onClick={handleAdvance}
            disabled={isPending}
            isLoading={isPending}
            size="sm"
          >
            Call First Patient
          </Button>
          {advanceError && (
            <p className="text-xs text-[#DC2626]" role="alert">{advanceError}</p>
          )}
        </div>
      ) : null}

      {/* ── Waiting Queue ──────────────────────────────────── */}
      <div className="bg-white border border-[#E3E9E6] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E3E9E6] flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-[#737A76]" aria-hidden />
          <h2 className="text-sm font-semibold text-[#151918]">
            Waiting <span className="text-[#737A76] font-normal">({waiting.length})</span>
          </h2>
        </div>

        {waiting.length === 0 ? (
          <EmptyState
            title="Queue is empty"
            description="No patients are currently waiting."
          />
        ) : (
          <div className="divide-y divide-[#EEF2F0]">
            {waiting.map((entry, idx) => {
              const durationAhead = waiting
                .slice(0, idx)
                .reduce((sum, e) => sum + (e.duration_minutes ?? 30), 0);
              const waitBefore = Math.ceil(durationAhead / chairCount);

              return (
                <div key={entry.id} className="px-5 py-3.5">
                  <QueueEntry entry={entry} showActions={!inProgress} />
                  {waitBefore > 0 && (
                    <p className="text-xs text-[#9BA39D] mt-1.5 pl-10">
                      Est. wait: ~{waitBefore} min
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Completed Today ─────────────────────────────────── */}
      {completed.length > 0 && (
        <div className="bg-white border border-[#E3E9E6] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E3E9E6] flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[#737A76]" aria-hidden />
            <h2 className="text-sm font-semibold text-[#151918]">
              Completed <span className="text-[#737A76] font-normal">({completed.length})</span>
            </h2>
          </div>
          <div className="divide-y divide-[#EEF2F0]">
            {completed.map((entry) => (
              <div key={entry.id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-[#F0FDF4] flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A]" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#737A76] truncate">
                    {entry.patient.name}
                  </p>
                  <p className="text-xs text-[#9BA39D]">
                    {entry.called_at ? `Seen ${formatTimeAgo(entry.called_at)}` : "Completed"}
                  </p>
                </div>
                <span className="text-xs text-[#16A34A] font-medium">Done</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-component ────────────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="bg-white border border-[#E3E9E6] rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#737A76]">{label}</p>
        <div className={`text-${highlight ? "[#B45309]" : "[#9BA39D]"}`}>{icon}</div>
      </div>
      <p className={`text-xl font-semibold tracking-tight ${highlight ? "text-[#B45309]" : "text-[#151918]"}`}>
        {value}
      </p>
    </div>
  );
}
