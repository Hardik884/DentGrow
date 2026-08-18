"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Dialog } from "@/components/ui/dialog";
import { TreatmentDetailDialog } from "@/components/dentist/TreatmentDetailModal";
import { TreatmentForm } from "@/components/dentist/TreatmentForm";
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
  /**
   * Show an Edit control on each row (dentist only).
   *
   * Deliberately NOT conditioned on the appointment's status. Clinics find
   * mistakes after the fact — a cost typed wrong, a treatment recorded against
   * the wrong tooth — and a record that locks on completion forces them to
   * either leave it wrong or work around it. The audit trail, not the form, is
   * what protects history.
   */
  editable?: boolean;
}

const STATUS_VARIANT_MAP: Record<TreatmentStatus, "default" | "info" | "success" | "error"> = {
  planned: "default",
  in_progress: "info",
  completed: "success",
  cancelled: "error",
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
  editable = false,
}: TreatmentListProps) {
  const isDentist = role === "dentist";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const canEdit = isDentist && editable;

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
              <span className="flex items-center gap-3">
                <span className="font-medium text-gray-700">
                  {formatCurrency(Number(treatment.cost))}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setEditingId(treatment.id)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                    aria-label={`Edit ${full.treatment_type ?? "treatment"}`}
                  >
                    <Pencil className="h-3 w-3" aria-hidden />
                    Edit
                  </button>
                )}
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

      {canEdit && (
        <Dialog
          open={editingId !== null}
          onClose={() => setEditingId(null)}
          title="Edit Treatment"
          size="xl"
        >
          <div className="p-4">
            {editingId && (
              <TreatmentForm
                treatmentId={editingId}
                onCancel={() => setEditingId(null)}
                onSuccess={() => {
                  setEditingId(null);
                }}
              />
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
