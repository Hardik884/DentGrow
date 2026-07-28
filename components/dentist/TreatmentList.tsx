"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TreatmentDetailDialog } from "@/components/dentist/TreatmentDetailModal";
import { formatDate, formatCurrency, TREATMENT_STATUS_LABELS } from "@/lib/utils";
import type { Treatment, TreatmentForReceptionist, TreatmentStatus } from "@/types";

interface TreatmentListProps {
  treatments: (Treatment | TreatmentForReceptionist)[];
  /** Determines which columns + links are rendered */
  role: "dentist" | "receptionist";
  /** Base href for treatment detail links (dentist only) */
  baseHref?: string;
  /** If true, show patient name column (used in clinic-wide list) */
  showPatient?: boolean;
}

const STATUS_VARIANT_MAP: Record<TreatmentStatus, "default" | "info" | "success" | "error"> = {
  planned: "default",
  in_progress: "info",
  completed: "success",
  cancelled: "error",
  declined: "error",
};

/**
 * TreatmentList
 *
 * Shared treatment list component for dentist + receptionist views.
 * - Dentist: treatment type opens the shared read-only Treatment detail dialog
 *   inline (no navigation) and shows the internal notes column.
 * - Receptionist: read-only, no modal trigger, hides internal_notes.
 */
export function TreatmentList({
  treatments,
  role,
  showPatient = false,
}: TreatmentListProps) {
  const isDentist = role === "dentist";
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (treatments.length === 0) {
    return (
      <div className="border rounded-lg p-6 text-center text-sm text-gray-500">
        No treatments found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {treatments.map((treatment) => {
        const full = treatment as Treatment;
        return (
          <div
            key={treatment.id}
            className="bg-white border rounded-lg p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {/* Treatment type as heading */}
                {isDentist ? (
                  <button
                    type="button"
                    onClick={() => setSelectedId(treatment.id)}
                    className="font-medium text-sm text-blue-600 hover:underline truncate block text-left"
                  >
                    {treatment.treatment_type}
                  </button>
                ) : (
                  <p className="font-medium text-sm text-gray-900 truncate">
                    {treatment.treatment_type}
                  </p>
                )}

                {/* Patient name — only in clinic-wide list */}
                {showPatient && (full as unknown as { patients?: { name: string } }).patients && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {(full as unknown as { patients: { name: string } }).patients.name}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge
                  label={TREATMENT_STATUS_LABELS[treatment.status as TreatmentStatus]}
                  variant={STATUS_VARIANT_MAP[treatment.status as TreatmentStatus]}
                />
              </div>
            </div>

            {/* Notes */}
            {treatment.patient_visible_notes && (
              <p className="text-xs text-gray-500">{treatment.patient_visible_notes}</p>
            )}

            {/* Footer row: date + cost */}
            <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t">
              <span>
                {treatment.performed_at
                  ? formatDate(treatment.performed_at)
                  : `Added ${formatDate(treatment.created_at)}`}
              </span>
              <span className="font-medium text-gray-700">
                {formatCurrency(Number(treatment.cost))}
              </span>
            </div>
          </div>
        );
      })}

      {isDentist && (
        <TreatmentDetailDialog
          treatmentId={selectedId}
          open={selectedId !== null}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
