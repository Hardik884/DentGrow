"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueue } from "@/hooks/useQueue";
import { advanceQueue } from "@/actions/queue";
import { QueueEntry } from "./QueueEntry";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { formatTimeAgo } from "@/lib/utils";
import type { QueueEntryWithPatient } from "@/types";

interface QueueMetrics {
  totalToday: number;
  checkedInToday: number;
  waitingNow: number;
  completedToday: number;
  inProgressNow: number;
  avgWaitMinutes: number;
}

interface QueueBoardProps {
  initialQueue: QueueEntryWithPatient[];
  clinicId?: string;
  metrics?: QueueMetrics;
}

/**
 * QueueBoard
 *
 * Full queue display for staff (dentist + receptionist).
 * Receives initial server-fetched data; subscribes to Realtime via useQueue.
 *
 * Sections:
 * - Metrics strip (total, waiting, completed, avg wait)
 * - Currently seeing card (in_progress) + Advance Queue button
 * - Waiting queue list with Call Next + Skip per entry
 * - Completed queue list
 *
 * Wait time estimates use appointment-specific durations, not clinic average.
 */
export function QueueBoard({
  initialQueue,
  clinicId = "",
  metrics,
}: QueueBoardProps) {
  const router = useRouter();
  const { queue, isLoading, error } = useQueue({ clinicId, initialQueue });
  const [isPending, startTransition] = useTransition();
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const waiting = queue.filter((e) => e.status === "waiting");
  const inProgress = queue.find((e) => e.status === "in_progress");
  const completed = queue.filter((e) => e.status === "completed");

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
      <div className="border rounded-lg p-4 bg-red-50 text-red-600 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Metrics strip ──────────────────────────────────────── */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="Total Today" value={metrics.totalToday} />
          <MetricCard
            label="Waiting Now"
            value={metrics.waitingNow}
            highlight={metrics.waitingNow > 0}
          />
          <MetricCard label="Completed" value={metrics.completedToday} />
          <MetricCard
            label="Avg Wait"
            value={`${metrics.avgWaitMinutes} min`}
          />
        </div>
      )}

      {/* ── Status bar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {waiting.length} waiting · {completed.length} completed today
        </span>
        {isLoading && <LoadingSpinner size="sm" />}
      </div>

      {/* ── Currently Seeing ────────────────────────────────────── */}
      {inProgress ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
              Currently Seeing
            </p>
            <span className="text-xs text-blue-400">
              {inProgress.duration_minutes ?? 30} min appointment
            </span>
          </div>
          <QueueEntry entry={inProgress} showActions={false} />
          <button
            type="button"
            onClick={handleAdvance}
            disabled={isPending}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Advancing…" : "Mark Done & Call Next"}
          </button>
          {advanceError && (
            <p className="text-xs text-red-600" role="alert">
              {advanceError}
            </p>
          )}
        </div>
      ) : waiting.length > 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <p className="text-sm text-gray-600">
            No one is currently being seen.
          </p>
          <button
            type="button"
            onClick={handleAdvance}
            disabled={isPending}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Calling…" : "Call First Patient"}
          </button>
          {advanceError && (
            <p className="text-xs text-red-600" role="alert">
              {advanceError}
            </p>
          )}
        </div>
      ) : null}

      {/* ── Waiting Queue ─────────────────────────────────────────── */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-900 text-sm">
            Waiting ({waiting.length})
          </h2>
        </div>

        {waiting.length === 0 ? (
          <div className="p-6 text-sm text-gray-500 text-center">
            No patients waiting.
          </div>
        ) : (
          <div className="divide-y">
            {waiting.map((entry, idx) => {
              // Estimated wait = sum of durations for entries before this one
              const waitBefore = waiting
                .slice(0, idx)
                .reduce((sum, e) => sum + (e.duration_minutes ?? 30), 0);

              return (
                <div key={entry.id} className="p-4 space-y-1">
                  <QueueEntry
                    entry={entry}
                    showActions={!inProgress}
                  />
                  {waitBefore > 0 && (
                    <p className="text-xs text-gray-400 pl-11">
                      Est. wait: ~{waitBefore} min
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Completed Today ───────────────────────────────────────── */}
      {completed.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-900 text-sm">
              Completed Today ({completed.length})
            </h2>
          </div>
          <div className="divide-y">
            {completed.map((entry) => (
              <div
                key={entry.id}
                className="px-4 py-3 flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-300 w-8 text-center tabular-nums font-bold">
                    {entry.position}
                  </span>
                  <div>
                    <p className="font-medium text-gray-700">
                      {entry.patient.name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {entry.called_at
                        ? `Seen ${formatTimeAgo(entry.called_at)}`
                        : "Completed"}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-green-600 font-medium">
                  ✓ Done
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-component ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight ? "bg-amber-50 border-amber-200" : "bg-white"
      }`}
    >
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p
        className={`text-2xl font-bold mt-1 ${
          highlight ? "text-amber-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
