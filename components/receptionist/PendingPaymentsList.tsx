import Link from "next/link";
import { getPatientsWithOutstandingBalance } from "@/actions/payments";
import { formatCurrency } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PaymentFormDialog } from "@/components/dentist/PaymentFormDialog";
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
    <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#09090B]">Remaining Balances</h2>
          <p className="text-xs text-[#71717A] mt-0.5">Patients with unpaid amounts</p>
        </div>
        {pendingPatients.length > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]">
            {pendingPatients.length}
          </span>
        )}
      </div>

      {result.error && (
        <div className="px-5 py-3 text-xs text-[#DC2626]">{result.error}</div>
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
        <div className="divide-y divide-[#F4F4F5]">
          {pendingPatients.map((patient) => (
            <div key={patient.id} className="flex items-center justify-between px-5 py-3 hover:bg-[#FAFAFA] transition-colors">
              <div>
                <Link
                  href={`${basePath}/patients/${patient.id}`}
                  className="text-sm font-medium text-[#09090B] hover:underline underline-offset-4"
                >
                  {patient.name}
                </Link>
                {patient.phone && (
                  <p className="text-xs text-[#A1A1AA]">{patient.phone}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-[#DC2626]">
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
