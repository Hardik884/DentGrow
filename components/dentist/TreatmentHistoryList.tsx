"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TreatmentDetailDialog } from "@/components/dentist/TreatmentDetailModal";
import { TREATMENT_STATUS_LABELS, formatDate, formatCurrency } from "@/lib/utils";
import type { TreatmentHistoryItem, TreatmentStatus } from "@/types";

const STATUS_VARIANT_MAP: Record<TreatmentStatus, "default" | "info" | "success" | "error"> = {
  planned: "default",
  in_progress: "info",
  completed: "success",
  cancelled: "error",
};

interface TreatmentHistoryListProps {
  items: TreatmentHistoryItem[];
  /** Clinic registration number, resolved server-side and shown in the read-only view. */
  registrationNumber?: string | null;
}

/**
 * TreatmentHistoryList
 *
 * Clickable "Past Treatment History" list. Each entry opens the shared,
 * centered, read-only Treatment detail dialog (TreatmentDetailDialog). No
 * editing, no navigation.
 */
export function TreatmentHistoryList({ items, registrationNumber }: TreatmentHistoryListProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <ul className="space-y-2">
        {items.map((t) => {
          const status = t.status as TreatmentStatus;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setSelectedId(t.id)}
                className="w-full text-left rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {t.treatment_type}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(t.performed_at ?? t.created_at)}
                      {t.dentistName && (
                        <span className="text-gray-400"> · {t.dentistName}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-medium text-gray-900">
                      {formatCurrency(Number(t.cost ?? 0))}
                    </span>
                    <StatusBadge
                      label={TREATMENT_STATUS_LABELS[status] ?? status}
                      variant={STATUS_VARIANT_MAP[status]}
                    />
                  </div>
                </div>
                {t.patient_visible_notes && (
                  <p className="text-xs text-gray-600 mt-1.5 whitespace-pre-wrap line-clamp-2">
                    {t.patient_visible_notes}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <TreatmentDetailDialog
        treatmentId={selectedId}
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        registrationNumber={registrationNumber}
      />
    </>
  );
}
