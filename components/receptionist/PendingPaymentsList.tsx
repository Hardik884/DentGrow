import Link from "next/link";
import { getPatientsWithOutstandingBalance } from "@/actions/payments";
import { formatCurrency } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PaymentFormDialog } from "@/components/dentist/PaymentFormDialog";
import { PaymentPlanControl } from "./PaymentPlanControl";
import { ACTION_BUTTON } from "@/lib/ui/action-styles";
import { CreditCard, Plus } from "lucide-react";

interface PendingPaymentsListProps {
  search?: string;
  /** Base href for patient profile links. Defaults to "/dentist". */
  basePath?: string;
}

export async function PendingPaymentsList({ search, basePath = "/dentist" }: PendingPaymentsListProps) {
  const result = await getPatientsWithOutstandingBalance();
  let pendingPatients = result.data ?? [];

  // Filter by search if provided
  if (search && search.trim()) {
    const searchLower = search.trim().toLowerCase();
    pendingPatients = pendingPatients.filter(
      (p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.phone?.toLowerCase().includes(searchLower)
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Remaining Balances</h2>
          <p className="text-xs text-text-secondary mt-0.5">Patients with unpaid amounts</p>
        </div>
        {pendingPatients.length > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-danger-bg text-danger border border-danger-border">
            {pendingPatients.length}
          </span>
        )}
      </div>

      {result.error && (
        <div className="px-5 py-3 text-xs text-danger">{result.error}</div>
      )}

      {pendingPatients.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-5 w-5" aria-hidden />}
          title="All clear"
          description={
            search
              ? "No patients with remaining balances match your search."
              : "No remaining balances."
          }
        />
      ) : (
        <div className="divide-y divide-surface-muted">
          {pendingPatients.map((patient) => (
            <div key={patient.id} className="flex items-center justify-between px-5 py-3 hover:bg-background transition-colors">
              <div className="min-w-0 flex-1">
                <Link
                  href={`${basePath}/patients/${patient.id}`}
                  className="text-sm font-medium text-text-primary hover:underline underline-offset-4 truncate block"
                >
                  {patient.name}
                </Link>
                {patient.phone && (
                  <p className="text-xs text-text-disabled">{patient.phone}</p>
                )}
                <div className="mt-1">
                  <PaymentPlanControl
                    patientId={patient.id}
                    paymentPlanUntil={patient.paymentPlanUntil}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-semibold text-danger">
                  {formatCurrency(patient.balance)}
                </span>
                <PaymentFormDialog
                  patientId={patient.id}
                  patientName={patient.name}
                  triggerClassName={ACTION_BUTTON}
                >
                  <Plus className="h-3 w-3" aria-hidden />
                  Record Payment
                </PaymentFormDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
