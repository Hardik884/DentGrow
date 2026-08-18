"use client";

/**
 * PrescriptionsView
 *
 * Client view for the receptionist Prescription History list.
 * Displays completed treatments containing medicines with view and print capabilities.
 */

import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getPrescriptions, type PrescriptionRecord } from "@/actions/prescriptions";
import { queryKeys } from "@/lib/query/keys";
import { ListTableSkeleton } from "@/components/shared/ListTableSkeleton";
import { ACTION_BUTTON } from "@/lib/ui/action-styles";
import { formatDateInTimezone } from "@/lib/utils";
import { Eye, Printer } from "lucide-react";
import { PrescriptionDialog } from "./PrescriptionDialog";

interface PrescriptionsViewProps {
  page: number;
  limit: number;
  search?: string;
  treatmentType?: string;
  dentistId?: string;
  medicineName?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Clinic IANA timezone, so the prescription date shows the clinic-local day. */
  clinicTimezone: string;
}

export function PrescriptionsView({
  page,
  limit,
  search,
  treatmentType,
  dentistId,
  medicineName,
  dateFrom,
  dateTo,
  clinicTimezone,
}: PrescriptionsViewProps) {
  const [selectedPrescription, setSelectedPrescription] = useState<PrescriptionRecord | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  const { data, isPending, isError, error, isPlaceholderData, isFetching } =
    useQuery({
      queryKey: queryKeys.prescriptions.list({
        page,
        search: search ?? "",
        treatmentType: treatmentType ?? "",
        dentistId: dentistId ?? "",
        medicineName: medicineName ?? "",
        dateFrom: dateFrom ?? "",
        dateTo: dateTo ?? "",
      }),
      queryFn: async () => {
        const res = await getPrescriptions({
          page,
          limit,
          search,
          treatmentType,
          dentistId,
          medicineName,
          dateFrom,
          dateTo,
        });
        if (res.error) throw new Error(res.error);
        return res.data ?? { prescriptions: [], total: 0 };
      },
      placeholderData: keepPreviousData,
    });

  const prescriptions = data?.prescriptions ?? [];
  const total = data?.total ?? 0;

  function handleView(prescription: PrescriptionRecord) {
    setSelectedPrescription(prescription);
    setViewDialogOpen(true);
  }

  function handlePrint(prescription: PrescriptionRecord) {
    setSelectedPrescription(prescription);
    // Open print dialog immediately
    setTimeout(() => {
      window.print();
    }, 100);
  }

  if (isPending) {
    return (
      <>
        <p className="text-sm text-text-secondary">Loading prescriptions…</p>
        <ListTableSkeleton />
      </>
    );
  }

  return (
    <>
      {/* Results count */}
      <p className="text-sm text-text-secondary">
        {total} prescription{total !== 1 ? "s" : ""} found
      </p>

      {/* Error */}
      {isError && (
        <p className="text-sm text-danger bg-danger-bg border border-danger-border rounded-md px-3 py-2">
          {(error as Error)?.message ?? "Failed to load prescriptions."}
        </p>
      )}

      {/* Table */}
      {prescriptions.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <p className="text-text-secondary text-sm">No prescriptions match your filters.</p>
          <p className="text-text-disabled text-xs mt-1">
            Try adjusting the date range or clearing filters.
          </p>
        </div>
      ) : (
        <div
          className={
            isPlaceholderData && isFetching ? "opacity-60 transition-opacity" : "transition-opacity"
          }
        >
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-muted bg-background text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    <th className="px-4 py-3">Prescription Date</th>
                    <th className="px-4 py-3">Patient Name</th>
                    <th className="px-4 py-3">Phone Number</th>
                    <th className="px-4 py-3">Treatment Type</th>
                    <th className="px-4 py-3">Prescribing Dentist</th>
                    <th className="px-4 py-3 text-center">Medicine Count</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-muted">
                  {prescriptions.map((rx) => (
                    <tr key={rx.id} className="hover:bg-background transition-colors">
                      <td className="px-4 py-3 text-text-body">
                        {formatDateInTimezone(rx.treatment_date, clinicTimezone)}
                      </td>
                      <td className="px-4 py-3 font-medium text-text-primary">
                        {rx.patient_name}
                      </td>
                      <td className="px-4 py-3 text-text-body">
                        {rx.patient_phone ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-text-body">
                        {rx.treatment_type}
                      </td>
                      <td className="px-4 py-3 text-text-body">
                        {rx.dentist_name}
                      </td>
                      <td className="px-4 py-3 text-center text-text-body">
                        {rx.medicine_count}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleView(rx)}
                            className={ACTION_BUTTON}
                          >
                            <Eye className="h-3 w-3" aria-hidden />
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrint(rx)}
                            className={ACTION_BUTTON}
                          >
                            <Printer className="h-3 w-3" aria-hidden />
                            Print
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* View Dialog */}
      {selectedPrescription && (
        <PrescriptionDialog
          prescription={selectedPrescription}
          open={viewDialogOpen}
          onOpenChange={setViewDialogOpen}
          clinicTimezone={clinicTimezone}
        />
      )}
    </>
  );
}
