import { getPaymentsForAppointment } from "@/actions/payments";
import { RecordAppointmentPayment } from "@/components/dentist/RecordAppointmentPayment";
import { PaymentList } from "@/components/dentist/PaymentList";
import { formatCurrency } from "@/lib/utils";
import type { Payment } from "@/types";

interface AppointmentPaymentsSectionProps {
  appointmentId: string;
  patientId: string;
  patientName: string;
}

/**
 * AppointmentPaymentsSection
 *
 * Server Component — payments panel on the appointment detail page.
 * Lists payments recorded against this appointment and lets the dentist
 * record a new payment inline (pre-linked to this appointment + patient).
 */
export async function AppointmentPaymentsSection({
  appointmentId,
  patientId,
  patientName,
}: AppointmentPaymentsSectionProps) {
  const result = await getPaymentsForAppointment(appointmentId);
  const payments = (result.data ?? []) as Payment[];

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  return (
    <div className="bg-white border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">Payments</h3>
          {payments.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              Paid against this appointment: {formatCurrency(totalPaid)}
            </p>
          )}
        </div>
        <RecordAppointmentPayment
          appointmentId={appointmentId}
          patientId={patientId}
          patientName={patientName}
        />
      </div>

      {result.error && <p className="text-sm text-red-600">{result.error}</p>}

      {payments.length === 0 ? (
        <p className="text-sm text-gray-500">No payments recorded for this appointment yet.</p>
      ) : (
        <PaymentList payments={payments} role="dentist" baseHref="/dentist" />
      )}
    </div>
  );
}
