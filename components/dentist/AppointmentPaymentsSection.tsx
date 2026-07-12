import { getPaymentsForAppointment } from "@/actions/payments";
import { PaymentList } from "@/components/dentist/PaymentList";
import { PaymentFormDialog } from "@/components/dentist/PaymentFormDialog";
import { OpdPaymentDialog } from "@/components/dentist/OpdPaymentDialog";
import { formatCurrency } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { Payment } from "@/types";

interface AppointmentPaymentsSectionProps {
  appointmentId: string;
  patientId: string;
  patientName: string;
}

/**
 * AppointmentPaymentsSection
 *
 * Payments panel on the Patient Visit page, split into two clearly separated
 * subsections that mirror real clinic operations:
 *   - OPD Payments      → standalone consultation fees (payment_type = "opd")
 *   - Treatment Payments → payments against treatments (payment_type = "treatment")
 *
 * Both subsections reuse the existing shared dialogs (OpdPaymentDialog,
 * PaymentFormDialog) and the recordPayment server action — no duplicated
 * payment infrastructure. Payments are read once via getPaymentsForAppointment
 * and partitioned by type.
 */
export async function AppointmentPaymentsSection({
  appointmentId,
  patientId,
  patientName,
}: AppointmentPaymentsSectionProps) {
  const result = await getPaymentsForAppointment(appointmentId);
  const payments = (result.data ?? []) as Payment[];

  const opdPayments = payments.filter((p) => p.payment_type === "opd");
  const treatmentPayments = payments.filter((p) => p.payment_type !== "opd");

  const opdTotal = opdPayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const treatmentTotal = treatmentPayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  return (
    <div className="bg-white border rounded-lg p-4 space-y-6">
      {result.error && <p className="text-sm text-red-600">{result.error}</p>}

      {/* ── OPD Payments ─────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">OPD Payments</h3>
            {opdPayments.length > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                Consultation fees: {formatCurrency(opdTotal)}
              </p>
            )}
          </div>
          <OpdPaymentDialog
            patientId={patientId}
            patientName={patientName}
            appointmentId={appointmentId}
            triggerVariant="outline"
            triggerSize="sm"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add OPD Payment
          </OpdPaymentDialog>
        </div>

        {opdPayments.length === 0 ? (
          <p className="text-sm text-gray-500">No OPD payments recorded for this appointment yet.</p>
        ) : (
          <PaymentList payments={opdPayments} role="dentist" baseHref="/dentist" />
        )}
      </section>

      {/* ── Treatment Payments (visually separated) ──────────── */}
      <section className="space-y-4 pt-5 border-t border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Treatment Payments</h3>
            {treatmentPayments.length > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                Paid against treatments: {formatCurrency(treatmentTotal)}
              </p>
            )}
          </div>
          <PaymentFormDialog
            patientId={patientId}
            patientName={patientName}
            appointmentId={appointmentId}
            triggerVariant="outline"
            triggerSize="sm"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Record Payment
          </PaymentFormDialog>
        </div>

        {treatmentPayments.length === 0 ? (
          <p className="text-sm text-gray-500">No treatment payments recorded for this appointment yet.</p>
        ) : (
          <PaymentList payments={treatmentPayments} role="dentist" baseHref="/dentist" />
        )}
      </section>
    </div>
  );
}
