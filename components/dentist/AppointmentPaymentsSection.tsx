import { getPaymentsForAppointment } from "@/actions/payments";
import { getTreatmentsForAppointment } from "@/actions/treatments";
import { PaymentFormDialog } from "@/components/dentist/PaymentFormDialog";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { formatCurrency, formatDate, PAYMENT_METHOD_LABELS } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { Payment, PaymentMethod, Treatment } from "@/types";

interface AppointmentPaymentsSectionProps {
  appointmentId: string;
  patientId: string;
  patientName: string;
}

/** Payment status derived from cost vs. amount paid. */
function derivePaymentStatus(
  cost: number,
  paid: number
): { label: string; variant: BadgeVariant } {
  if (cost <= 0) return { label: "No Charge", variant: "secondary" };
  if (paid <= 0) return { label: "Pending", variant: "secondary" };
  if (paid >= cost) return { label: "Paid", variant: "success" };
  return { label: "Partial", variant: "warning" };
}

/**
 * AppointmentPaymentsSection
 *
 * Treatment-wise payment tracker on the Patient Visit page. Every treatment
 * recorded for the appointment is listed automatically (same order as the
 * Treatments section) with its own cost, payment history, remaining balance,
 * status and a pre-linked "Add Payment" action.
 *
 * Reuses existing infrastructure only:
 *   - getTreatmentsForAppointment / getPaymentsForAppointment (2 queries, no N+1)
 *   - PaymentFormDialog (treatment payments, treatment pre-selected)
 * No payment logic or calculations are duplicated.
 */
export async function AppointmentPaymentsSection({
  appointmentId,
  patientId,
  patientName,
}: AppointmentPaymentsSectionProps) {
  const [treatmentsResult, paymentsResult] = await Promise.all([
    getTreatmentsForAppointment(appointmentId),
    getPaymentsForAppointment(appointmentId),
  ]);

  const treatments = (treatmentsResult.data ?? []) as Treatment[];
  const payments = (paymentsResult.data ?? []) as Payment[];
  const error = treatmentsResult.error || paymentsResult.error;

  // Partition payments: treatment-linked, and everything else on this visit.
  //
  // OPD payments used to be dropped here entirely, which was defensible while
  // the OPD toggle was hidden. Now that a consultation fee can be CHARGED, a
  // hidden payment against it would leave the visit looking part-paid with no
  // explanation, so consultation payments fall into the unassigned bucket and
  // are shown alongside the rest.
  const paymentsByTreatment = new Map<string, Payment[]>();
  const unassignedPayments: Payment[] = [];
  for (const p of payments) {
    if (p.treatment_id) {
      const list = paymentsByTreatment.get(p.treatment_id) ?? [];
      list.push(p);
      paymentsByTreatment.set(p.treatment_id, list);
    } else {
      unassignedPayments.push(p);
    }
  }

  return (
    <div className="bg-white border rounded-lg p-4 space-y-5">
      <div>
        <h3 className="font-semibold text-gray-900">Payments</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Payments are tracked per treatment recorded on this visit.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* ── Treatment-wise payments ─────────────────────────── */}
      {treatments.length === 0 ? (
        <p className="text-sm text-gray-500">
          No treatments recorded yet. Add a treatment to start tracking payments.
        </p>
      ) : (
        <div className="space-y-3">
          {treatments.map((t) => {
            const cost = Number(t.cost ?? 0);
            const linked = paymentsByTreatment.get(t.id) ?? [];
            const paid = linked.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
            const remaining = Math.max(0, cost - paid);
            const status = derivePaymentStatus(cost, paid);
            return (
              <TreatmentPaymentCard
                key={t.id}
                title={t.treatment_type}
                cost={cost}
                paid={paid}
                remaining={remaining}
                statusLabel={status.label}
                statusVariant={status.variant}
                payments={linked}
                action={
                  <PaymentFormDialog
                    patientId={patientId}
                    patientName={patientName}
                    appointmentId={appointmentId}
                    treatmentId={t.id}
                    defaultAmount={remaining > 0 ? remaining : undefined}
                    title={`Payment · ${t.treatment_type}`}
                    triggerVariant="outline"
                    triggerSize="sm"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Add Payment
                  </PaymentFormDialog>
                }
              />
            );
          })}

          {/* Unassigned treatment payments (legacy / not linked to a treatment) */}
          {unassignedPayments.length > 0 && (
            <TreatmentPaymentCard
              title="Other Payments"
              subtitle="Payments not linked to a specific treatment"
              payments={unassignedPayments}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** A single treatment's payment card: cost / paid / remaining / status + history. */
function TreatmentPaymentCard({
  title,
  subtitle,
  cost,
  paid,
  remaining,
  statusLabel,
  statusVariant,
  payments,
  action,
}: {
  title: string;
  subtitle?: string;
  cost?: number;
  paid?: number;
  remaining?: number;
  statusLabel?: string;
  statusVariant?: BadgeVariant;
  payments: Payment[];
  action?: React.ReactNode;
}) {
  const showStats = cost != null;
  return (
    <div className="rounded-lg border border-[#E4E4E7] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#09090B] truncate">{title}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {statusLabel && statusVariant && (
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        )}
      </div>

      {showStats && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Cost" value={formatCurrency(cost ?? 0)} />
          <Stat label="Paid" value={formatCurrency(paid ?? 0)} accent="green" />
          <Stat
            label="Remaining"
            value={formatCurrency(remaining ?? 0)}
            accent={remaining && remaining > 0 ? "red" : undefined}
          />
        </div>
      )}

      <PaymentRows payments={payments} emptyLabel="No payments recorded yet." />

      {action && <div className="flex justify-end pt-1">{action}</div>}
    </div>
  );
}

/** Compact list of individual payment transactions. */
function PaymentRows({
  payments,
  emptyLabel,
}: {
  payments: Payment[];
  emptyLabel: string;
}) {
  if (payments.length === 0) {
    return <p className="text-xs text-gray-400">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-y divide-[#F4F4F5] rounded-lg bg-[#FAFAFA] px-3">
      {payments.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#09090B]">
              {PAYMENT_METHOD_LABELS[p.method as PaymentMethod]}
            </p>
            <p className="text-[11px] text-gray-400">{formatDate(p.payment_date)}</p>
          </div>
          <span className="text-sm font-semibold text-[#16A34A] shrink-0">
            +{formatCurrency(Number(p.amount ?? 0))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Small labelled figure used in the cost/paid/remaining grid. */
function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "red";
}) {
  const color =
    accent === "green" ? "text-[#16A34A]" : accent === "red" ? "text-[#DC2626]" : "text-[#09090B]";
  return (
    <div className="rounded-lg bg-white border border-[#E4E4E7] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[#71717A]">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}
