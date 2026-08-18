import {
  getPaymentsForAppointment,
  getOutstandingBalance,
  getPatientTreatmentCollections,
} from "@/actions/payments";
import { getTreatmentsForAppointment } from "@/actions/treatments";
import { PaymentFormDialog } from "@/components/dentist/PaymentFormDialog";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { treatmentTotalCharge } from "@/lib/billing/balance";
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
  const [treatmentsResult, paymentsResult, balanceResult, collectionsResult] = await Promise.all([
    getTreatmentsForAppointment(appointmentId),
    getPaymentsForAppointment(appointmentId),
    // Patient-level, not visit-level, on purpose. What the patient owes is not
    // a property of the visit they happen to be sitting in — see the
    // visit-level payment action below.
    getOutstandingBalance(patientId),
    // Per-treatment "paid", pooled across the patient's WHOLE payment history
    // (not just this visit's), oldest-treatment-first — audit B8. Without this
    // a treatment could show "Pending" even though the patient had already
    // paid, via a lump-sum or unlinked payment recorded elsewhere.
    getPatientTreatmentCollections(patientId),
  ]);

  const treatments = (treatmentsResult.data ?? []) as Treatment[];
  const payments = (paymentsResult.data ?? []) as Payment[];
  const outstandingBalance = balanceResult.data ?? 0;
  const collections = collectionsResult.data ?? {};
  const error = treatmentsResult.error || paymentsResult.error;

  // "Other Payments" — payments recorded on THIS visit not linked to any of
  // its treatments. Shown for visibility only; the per-treatment stats below
  // use the pooled patient-wide allocation instead, so a payment sitting here
  // may already be counted toward one of the treatment cards above (audit B8).
  const unassignedPayments = payments.filter((p) => !p.treatment_id);

  return (
    <div className="bg-surface border rounded-lg p-4 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-text-primary">Payments</h3>
          <p className="text-xs text-text-secondary mt-0.5">
            Payments are tracked per treatment recorded on this visit.
          </p>
        </div>

        {/* Visit-level payment action.
            Deliberately OUTSIDE the treatments list. A patient returning to
            continue work recorded at an earlier visit has an outstanding
            balance but no new treatment today, and while this button lived
            only inside the per-treatment loop such a visit offered no way to
            take their money at all. What the patient owes is a property of the
            patient, so the action follows the balance, not the visit. */}
        {outstandingBalance > 0 && (
          <div className="text-right">
            <PaymentFormDialog
              patientId={patientId}
              patientName={patientName}
              appointmentId={appointmentId}
              defaultAmount={outstandingBalance}
              title="Payment · Outstanding Balance"
              triggerVariant="default"
              triggerSize="sm"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add Payment
            </PaymentFormDialog>
            <p className="text-[11px] text-danger mt-1">
              {formatCurrency(outstandingBalance)} outstanding
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* ── Treatment-wise payments ─────────────────────────── */}
      {treatments.length === 0 ? (
        <p className="text-sm text-text-secondary">
          No treatments recorded on this visit.
          {outstandingBalance > 0
            ? " Use Add Payment above to collect against the patient's outstanding balance."
            : " Add a treatment to start tracking payments."}
        </p>
      ) : (
        <div className="space-y-3">
          {treatments.map((t) => {
            // The full charge for this line item — treatment cost plus any OPD
            // and X-ray fees recorded against it. Reading bare `cost` here left
            // a card showing "Paid" while its radiograph was still owed.
            const cost = treatmentTotalCharge(t);
            // "Paid" comes from the pooled, patient-wide allocation (audit B8),
            // not just payments explicitly linked to this treatment — a
            // lump-sum or unlinked payment can settle it too.
            const paid = collections[t.id] ?? 0;
            const remaining = Math.max(0, cost - paid);
            const status = derivePaymentStatus(cost, paid);
            // The payment rows shown below are still only the ones explicitly
            // linked to this treatment — an honest "these specific payments
            // are tagged here" list, which can be a smaller amount than "Paid"
            // above when pooling settled this treatment from elsewhere.
            const linked = payments.filter((p) => p.treatment_id === t.id);
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
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{title}</p>
          {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
        </div>
        {statusLabel && statusVariant && (
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        )}
      </div>

      {showStats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
    return <p className="text-xs text-text-disabled">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-y divide-surface-muted rounded-lg bg-background px-3">
      {payments.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-primary">
              {PAYMENT_METHOD_LABELS[p.method as PaymentMethod]}
            </p>
            <p className="text-[11px] text-text-disabled">{formatDate(p.payment_date)}</p>
          </div>
          <span className="text-sm font-semibold text-success shrink-0">
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
    accent === "green" ? "text-success" : accent === "red" ? "text-danger" : "text-text-primary";
  return (
    <div className="rounded-lg bg-surface border border-border px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}
