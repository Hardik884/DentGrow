"use client";

/**
 * PrescriptionDialog
 *
 * Read-only dialog displaying prescription details for receptionists.
 * Shows ONLY information useful for answering patient medication questions:
 * - Patient info (name, phone)
 * - Prescription info (treatment type, date, prescribing dentist)
 * - Medicines (name, strength, dosage, frequency, duration, instructions)
 * - Patient-visible notes
 * - Dentist signature and registration number
 *
 * Does NOT show:
 * - Clinical notes
 * - Diagnosis
 * - Internal dentist notes
 * - Draft treatments
 * - AI-generated clinical reasoning
 * - Editable fields
 */

import type { PrescriptionRecord } from "@/actions/prescriptions";
import { formatDateInTimezone } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { X, Printer } from "lucide-react";

interface PrescriptionDialogProps {
  prescription: PrescriptionRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Clinic IANA timezone, so the printed date shows the clinic-local day. */
  clinicTimezone: string;
}

export function PrescriptionDialog({
  prescription,
  open,
  onOpenChange,
  clinicTimezone,
}: PrescriptionDialogProps) {
  if (!open) return null;

  function handlePrint() {
    window.print();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prescription-dialog-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-scrim/45 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl border border-[#E3E9E6] shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-fade-in-up print-prescription document-light">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#E3E9E6] px-6 py-4 flex items-center justify-between no-print">
          <h2 id="prescription-dialog-title" className="text-lg font-semibold text-[#151918]">
            Prescription Details
          </h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              className="flex items-center gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden />
              Print
            </Button>
            <button
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 rounded-lg hover:bg-[#EEF2F0] flex items-center justify-center transition-colors"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4 text-[#737A76]" aria-hidden />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Patient Information */}
          <div>
            <h3 className="text-sm font-semibold text-[#151918] uppercase tracking-wide mb-3">
              Patient Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[#737A76] text-xs uppercase tracking-wide mb-1">Name</p>
                <p className="text-[#151918] font-medium">{prescription.patient_name}</p>
              </div>
              <div>
                <p className="text-[#737A76] text-xs uppercase tracking-wide mb-1">Phone</p>
                <p className="text-[#151918] font-medium">
                  {prescription.patient_phone ?? "—"}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Prescription Information */}
          <div>
            <h3 className="text-sm font-semibold text-[#151918] uppercase tracking-wide mb-3">
              Prescription Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[#737A76] text-xs uppercase tracking-wide mb-1">Treatment Type</p>
                <p className="text-[#151918] font-medium">{prescription.treatment_type}</p>
              </div>
              <div>
                <p className="text-[#737A76] text-xs uppercase tracking-wide mb-1">Treatment Date</p>
                <p className="text-[#151918] font-medium">
                  {formatDateInTimezone(prescription.treatment_date, clinicTimezone)}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-[#737A76] text-xs uppercase tracking-wide mb-1">Prescribing Dentist</p>
                <p className="text-[#151918] font-medium">{prescription.dentist_name}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Medicines */}
          <div>
            <h3 className="text-sm font-semibold text-[#151918] uppercase tracking-wide mb-3">
              Medicines ({prescription.medicine_count})
            </h3>
            <div className="space-y-4">
              {prescription.medications.map((med, idx) => (
                <div
                  key={idx}
                  className="bg-[#F6F8F6] border border-[#E3E9E6] rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[#151918] font-semibold">{med.name}</p>
                      {med.dosage && (
                        <p className="text-xs text-[#737A76] mt-0.5">
                          Strength: {med.dosage}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-[#737A76] text-xs">Dosage</p>
                      <p className="text-[#151918] font-medium">
                        {med.number} {med.number === 0.5 ? "tablet (½)" : med.number === 1 ? "tablet" : "tablets"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#737A76] text-xs">Frequency</p>
                      <p className="text-[#151918] font-medium">{med.dosage || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[#737A76] text-xs">Duration</p>
                      <p className="text-[#151918] font-medium">
                        {med.days} {med.days === 1 ? "day" : "days"}
                      </p>
                    </div>
                  </div>
                  {med.instructions && (
                    <div className="pt-2 border-t border-[#E3E9E6]">
                      <p className="text-[#737A76] text-xs">Instructions</p>
                      <p className="text-[#151918] text-sm mt-1">{med.instructions}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Patient Visible Notes */}
          {prescription.patient_visible_notes && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold text-[#151918] uppercase tracking-wide mb-3">
                  Patient Visible Notes
                </h3>
                <p className="text-sm text-[#5B635E] whitespace-pre-wrap">
                  {prescription.patient_visible_notes}
                </p>
              </div>
            </>
          )}

          {/* Dentist Signature */}
          {(prescription.dentist_signature_url || prescription.dentist_registration_number) && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold text-[#151918] uppercase tracking-wide mb-3">
                  Dentist Signature
                </h3>
                <div className="space-y-3">
                  {prescription.dentist_signature_url && (
                    <div className="relative w-48 h-24 bg-[#F6F8F6] border border-[#E3E9E6] rounded-lg overflow-hidden">
                      <Image
                        src={prescription.dentist_signature_url}
                        alt="Dentist signature"
                        fill
                        className="object-contain p-2"
                      />
                    </div>
                  )}
                  <div className="text-sm">
                    <p className="text-[#151918] font-medium">{prescription.dentist_name}</p>
                    {prescription.dentist_registration_number && (
                      <p className="text-[#737A76] text-xs mt-1">
                        Registration No: {prescription.dentist_registration_number}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
