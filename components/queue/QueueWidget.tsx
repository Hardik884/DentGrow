"use client";

import { useQueue } from "@/hooks/useQueue";
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { Separator } from "@/components/ui/separator";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { QueueEntryWithPatient } from "@/types";

interface QueueWidgetProps {
  initialQueue?: QueueEntryWithPatient[];
  clinicId?: string;
  /** Role-prefixed href for "View all" link */
  queueHref?: string;
}

export function QueueWidget({ initialQueue = [], clinicId = "", queueHref }: QueueWidgetProps) {
  const { queue } = useQueue({ clinicId, initialQueue });

  const current = queue.find((e) => e.status === "in_progress");
  const next = queue.filter((e) => e.status === "waiting")[0];
  const waitingCount = queue.filter((e) => e.status === "waiting").length;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
          <h2 className="text-sm font-semibold text-text-primary">Live Queue</h2>
        </div>
        {waitingCount > 0 && (
          <span className="text-xs text-text-secondary">{waitingCount} waiting</span>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Now seeing */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">Now Seeing</p>
          {current ? (
            <div className="flex items-center gap-2.5">
              <PatientAvatar name={current.patient.name} size="sm" />
              <div>
                <p className="text-sm font-medium text-text-primary">{current.patient.name}</p>
                <p className="text-xs text-text-secondary">{current.duration_minutes ?? 30} min appt</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-disabled">No one being seen</p>
          )}
        </div>

        <Separator />

        {/* Next up */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">Up Next</p>
          {next ? (
            <div className="flex items-center gap-2.5">
              <PatientAvatar name={next.patient.name} size="sm" />
              <p className="text-sm text-text-secondary">{next.patient.name}</p>
            </div>
          ) : (
            <p className="text-sm text-text-disabled">Queue is empty</p>
          )}
        </div>
      </div>

      {queueHref && (
        <div className="px-5 py-3 border-t border-surface-muted">
          <Link
            href={queueHref}
            className="flex items-center justify-between text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            View full queue
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}
