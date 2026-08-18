import { getTreatmentsForAppointment } from "@/actions/treatments";
import { TreatmentList } from "@/components/dentist/TreatmentList";
import { TreatmentFormDialog } from "@/components/dentist/TreatmentFormDialog";
import { AppointmentPatientHistorySection } from "@/components/dentist/AppointmentPatientHistorySection";
import { formatCurrency } from "@/lib/utils";
import { sumTreatmentCharges } from "@/lib/billing/balance";
import { Plus } from "lucide-react";
import type { Treatment } from "@/types";

interface AppointmentTreatmentsSectionProps {
  appointmentId: string;
  patientId: string;
  /** Used only to personalise the follow-up prompt. */
  patientName?: string;
}

/**
 * AppointmentTreatmentsSection
 *
 * Server Component — treatments block on the appointment detail page.
 * Dentist: full records + add treatment button.
 */
export async function AppointmentTreatmentsSection({
  appointmentId,
  patientId,
  patientName,
}: AppointmentTreatmentsSectionProps) {
  const result = await getTreatmentsForAppointment(appointmentId);
  const treatments = (result.data ?? []) as Treatment[];

  // Canonical charge: billable cost + OPD + X-ray, matching the outstanding
  // balance and the Payments section below it (audit A6).
  const totalCost = sumTreatmentCharges(treatments);

  return (
    <div className="bg-surface border rounded-lg p-4 space-y-5">
      {/* ── Current Treatment ─────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-text-primary">Treatments</h3>
            {treatments.length > 0 && (
              <p className="text-xs text-text-secondary mt-0.5">
                Total: {formatCurrency(totalCost)}
              </p>
            )}
          </div>
          {/* promptFollowUp: recording treatment is the moment the next visit
              is decided, and the moment a clinic forgets to book it. */}
          <TreatmentFormDialog
            appointmentId={appointmentId}
            patientId={patientId}
            patientName={patientName}
            promptFollowUp
            triggerVariant="outline"
            triggerSize="sm"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add Treatment
          </TreatmentFormDialog>
        </div>

        {result.error && <p className="text-sm text-danger">{result.error}</p>}

        {/* editable: a completed appointment is not a sealed record. Clinics
            discover mistakes later, and locking the form only forces a
            workaround. */}
        <TreatmentList
          treatments={treatments}
          role="dentist"
          baseHref="/dentist"
          editable
        />
      </div>

      {/* ── Past Treatment History (visually separated) ───── */}
      <div className="pt-5 border-t border-border">
        <AppointmentPatientHistorySection
          patientId={patientId}
          currentAppointmentId={appointmentId}
        />
      </div>
    </div>
  );
}
