import { getPatientTreatments } from "@/actions/treatments";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { MedicationTable } from "@/components/shared/MedicationTable";
import { TreatmentDocumentsSection } from "@/components/dentist/TreatmentDocumentsSection";
import { EmptyState } from "@/components/ui/empty-state";
import {
  formatDate,
  formatCurrency,
  TREATMENT_STATUS_LABELS,
} from "@/lib/utils";
import { Stethoscope, PenLine, Pill } from "lucide-react";
import type { TreatmentStatus, MedicationInput } from "@/types";

const STATUS_VARIANT_MAP: Record<TreatmentStatus, "default" | "info" | "success" | "error"> = {
  planned: "default",
  in_progress: "info",
  completed: "success",
  cancelled: "error",
};

/**
 * TreatmentHistoryList — Patient Portal
 *
 * Presents the SAME treatment information available to the dentist, in a
 * patient-friendly layout, while hiding all staff-only fields:
 *   - Shows: type, status, cost, treatment date, created date, medications,
 *     patient-visible notes, uploaded documents and the dentist's signature.
 *   - Never shows: internal/clinical notes, staff metadata or audit fields
 *     (these are not even fetched by getPatientTreatments).
 *
 * Medications reuse the shared <MedicationTable>; documents reuse the shared
 * <TreatmentDocumentsSection> (delete disabled, hidden when empty). The
 * signature is shown for EVERY status whenever the dentist has uploaded one.
 */
export async function TreatmentHistoryList() {
  const result = await getPatientTreatments("");
  const treatments = result.data ?? [];

  if (result.error) {
    return (
      <div className="border border-danger-border rounded-xl p-4 text-xs text-danger bg-danger-bg text-center">
        Failed to load treatments. Please try again later.
      </div>
    );
  }

  if (treatments.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl">
        <EmptyState
          icon={<Stethoscope className="h-5 w-5" aria-hidden />}
          title="No treatment records"
          description="Your treatment history will appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {treatments.map((treatment) => {
        const status = treatment.status as TreatmentStatus;
        const statusLabel = TREATMENT_STATUS_LABELS[status];
        const treatmentDate = treatment.performed_at
          ? formatDate(treatment.performed_at)
          : "Not recorded";
        const medications: MedicationInput[] = Array.isArray(treatment.medications)
          ? (treatment.medications as unknown as MedicationInput[])
          : [];

        return (
          <div
            key={treatment.id}
            className="bg-surface border border-border rounded-xl overflow-hidden"
          >
            {/* ── Header ──────────────────────────────────────── */}
            <div className="px-5 py-4 flex items-start justify-between gap-3 border-b border-surface-muted">
              <p className="text-sm font-semibold text-text-primary">
                {treatment.treatment_type}
              </p>
              <StatusBadge
                label={statusLabel}
                variant={STATUS_VARIANT_MAP[status]}
              />
            </div>

            {/* ── Key details ─────────────────────────────────── */}
            <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Detail
                label="Cost"
                value={formatCurrency(Number(treatment.cost))}
              />
              <Detail label="Treatment Date" value={treatmentDate} />
              <Detail label="Created" value={formatDate(treatment.created_at)} />
            </div>

            {/* ── Medications ─────────────────────────────────── */}
            {medications.length > 0 && (
              <div className="px-5 py-4 border-t border-surface-muted space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-secondary">
                  <Pill className="h-3.5 w-3.5" aria-hidden />
                  Medications
                </div>
                <MedicationTable medications={medications} />
              </div>
            )}

            {/* ── Patient-visible notes (never clinical notes) ── */}
            {treatment.patient_visible_notes && (
              <div className="px-5 py-4 border-t border-surface-muted space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                  Notes
                </p>
                <p className="text-sm text-text-body whitespace-pre-wrap">
                  {treatment.patient_visible_notes}
                </p>
              </div>
            )}

            {/* ── Documents (PDF / images) — reuses the shared section,
                 with delete disabled and hidden entirely when none exist. ── */}
            <div className="px-5 pb-4 empty:hidden">
              <TreatmentDocumentsSection
                treatmentId={treatment.id}
                canDelete={false}
                hideWhenEmpty
              />
            </div>

            {/* ── Digital signature — shown for ANY status whose
                 dentist has uploaded a signature. Hidden otherwise. */}
            {treatment.signature && (
              <div className="px-5 py-4 border-t border-surface-muted">
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                    <PenLine className="h-3 w-3" aria-hidden />
                    Digitally Signed By
                  </div>
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-medium text-text-primary">
                      {treatment.signature.dentistName}
                    </p>
                    {treatment.signature.registrationNumber && (
                      <p className="text-xs text-text-secondary">
                        Registration No: {treatment.signature.registrationNumber}
                      </p>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={treatment.signature.signatureUrl}
                      alt={`Signature of ${treatment.signature.dentistName}`}
                      className="max-h-14 max-w-[180px] object-contain"
                    />
                    <div className="space-y-0.5 text-xs text-text-secondary">
                      <p>Status: {statusLabel}</p>
                      <p>Treatment Date: {treatmentDate}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p className="text-sm font-semibold text-text-primary mt-0.5">{value}</p>
    </div>
  );
}
