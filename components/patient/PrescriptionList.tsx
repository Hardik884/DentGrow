import { getPatientPrescriptions } from "@/actions/prescriptions";
import { MedicationTable } from "@/components/shared/MedicationTable";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { Pill, PenLine } from "lucide-react";
import type { MedicationInput } from "@/types";

/**
 * PrescriptionList — Patient Portal (audit B9)
 *
 * A read-only list of the authenticated patient's own prescriptions —
 * treatments that carry medications. Mirrors the visual language of
 * `TreatmentHistoryList` (the treatment-history equivalent this list sits
 * beside), but stays focused on what a prescription slip needs: what was
 * prescribed, when, and by whom — not the full treatment record.
 *
 * Everything shown comes from `getPatientPrescriptions`, which is already
 * scoped to the authenticated patient and column-safe (no internal_notes, no
 * cost splits) — this component adds no additional data access of its own.
 */
export async function PrescriptionList() {
  const result = await getPatientPrescriptions();
  const prescriptions = result.data ?? [];

  if (result.error) {
    return (
      <div className="border border-[#FECACA] rounded-xl p-4 text-xs text-[#DC2626] bg-[#FEF2F2] text-center">
        Failed to load prescriptions. Please try again later.
      </div>
    );
  }

  if (prescriptions.length === 0) {
    return (
      <div className="bg-white border border-[#E4E4E7] rounded-xl">
        <EmptyState
          icon={<Pill className="h-5 w-5" aria-hidden />}
          title="No prescriptions"
          description="Prescribed medications will appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {prescriptions.map((p) => {
        const medications: MedicationInput[] = Array.isArray(p.medications)
          ? (p.medications as unknown as MedicationInput[])
          : [];
        const prescribedOn = p.performed_at ? formatDate(p.performed_at) : formatDate(p.created_at);

        return (
          <div
            key={p.id}
            className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden"
          >
            <div className="px-5 py-4 flex items-start justify-between gap-3 border-b border-[#F4F4F5]">
              <div>
                <p className="text-sm font-semibold text-[#09090B]">{p.treatment_type}</p>
                <p className="text-xs text-[#71717A] mt-0.5">{prescribedOn}</p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[#71717A]">
                <Pill className="h-3.5 w-3.5" aria-hidden />
                Medications
              </div>
              <MedicationTable medications={medications} />
            </div>

            {p.patient_visible_notes && (
              <div className="px-5 py-4 border-t border-[#F4F4F5] space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-[#71717A]">Notes</p>
                <p className="text-sm text-[#52525B] whitespace-pre-wrap">{p.patient_visible_notes}</p>
              </div>
            )}

            {p.signature && (
              <div className="px-5 py-4 border-t border-[#F4F4F5]">
                <div className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-4 py-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[#71717A]">
                    <PenLine className="h-3 w-3" aria-hidden />
                    Prescribed By
                  </div>
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-medium text-[#09090B]">{p.signature.dentistName}</p>
                    {p.signature.registrationNumber && (
                      <p className="text-xs text-[#71717A]">
                        Registration No: {p.signature.registrationNumber}
                      </p>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.signature.signatureUrl}
                      alt={`Signature of ${p.signature.dentistName}`}
                      className="max-h-14 max-w-[180px] object-contain"
                    />
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
