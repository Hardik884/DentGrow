import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { ExternalConsultationDialog } from "@/components/dentist/ExternalConsultationDialog";
import { getConsultancyIncome } from "@/actions/consultants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { ConsultancyIncome } from "@/types";

export const metadata: Metadata = {
  title: "External Consultations",
};

/**
 * /dentist/external-consultations
 *
 * Dedicated module for external consultancy income — earnings the dentist made
 * at other clinics. Fully separate from clinic Payments. Dentist role only
 * (enforced in getConsultancyIncome). Entries are shown newest first and are
 * added via the shared centered dialog, reusing recordConsultancyIncome.
 */
export default async function ExternalConsultationsPage() {
  const { data, error } = await getConsultancyIncome();
  const entries = (data ?? []) as ConsultancyIncome[];

  const total = entries.reduce((sum, e) => sum + Number(e.amount ?? 0), 0);

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="External Consultations">
        <ExternalConsultationDialog triggerVariant="default">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add External Consultation
        </ExternalConsultationDialog>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E4E4E7] rounded-xl p-4">
          <p className="text-xs font-medium text-[#71717A] uppercase tracking-wide">
            Total External Income
          </p>
          <p className="text-2xl font-semibold text-[#09090B] mt-1">
            {formatCurrency(total)}
          </p>
        </div>
        <div className="bg-white border border-[#E4E4E7] rounded-xl p-4">
          <p className="text-xs font-medium text-[#71717A] uppercase tracking-wide">
            Consultations Recorded
          </p>
          <p className="text-2xl font-semibold text-[#09090B] mt-1">{entries.length}</p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {entries.length === 0 ? (
        <div className="bg-white border border-[#E4E4E7] rounded-xl p-12 text-center">
          <p className="text-sm text-[#71717A]">No external consultations recorded yet.</p>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Use “Add External Consultation” to record income earned at another clinic.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F4F4F5] bg-[#FAFAFA] text-left text-xs font-semibold text-[#71717A] uppercase tracking-wide">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Clinic Name</th>
                  <th className="px-4 py-3">Treatment Performed</th>
                  <th className="px-4 py-3 text-right">Amount Earned</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F5]">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-[#FAFAFA] transition-colors">
                    <td className="px-4 py-3 text-[#52525B] whitespace-nowrap">
                      {formatDate(e.date)}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#09090B]">
                      {e.external_clinic ? e.external_clinic : "—"}
                    </td>
                    <td className="px-4 py-3 text-[#52525B]">
                      {e.description ? e.description : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[#09090B] whitespace-nowrap">
                      {formatCurrency(Number(e.amount ?? 0))}
                    </td>
                    <td className="px-4 py-3 text-[#52525B]">
                      {e.notes ? e.notes : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
