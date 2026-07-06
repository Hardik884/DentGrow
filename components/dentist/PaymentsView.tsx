"use client";

/**
 * PaymentsView
 *
 * Client component that fetches and renders the paginated payments list
 * using TanStack Query. Supports search and filter params passed from URL.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getAllPayments } from "@/actions/payments";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { ListTableSkeleton } from "@/components/shared/ListTableSkeleton";
import { CreditCard, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";

interface PaymentsViewProps {
  page: number;
  limit: number;
  search?: string;
  method?: string;
  dateFrom?: string;
  dateTo?: string;
  basePath?: string; // e.g. "/dentist" or "/receptionist"
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank_transfer: "Bank Transfer",
};

export function PaymentsView({
  page,
  limit,
  search,
  method,
  dateFrom,
  dateTo,
  basePath = "/dentist",
}: PaymentsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["payments", { page, limit, search, method, dateFrom, dateTo }],
    queryFn: () => getAllPayments({ page, limit, search, method, dateFrom, dateTo }),
    staleTime: 1000 * 60 * 5, // 5 min
  });

  function navigateToPage(newPage: number) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("page", String(newPage));
    router.push(`?${sp.toString()}`);
  }

  if (isLoading) {
    return <ListTableSkeleton />;
  }

  if (error) {
    return (
      <div className="bg-white border border-[#E4E4E7] rounded-xl p-6">
        <p className="text-sm text-[#DC2626]">Failed to load payments.</p>
      </div>
    );
  }

  const result = data?.data;
  if (!result) {
    return (
      <div className="bg-white border border-[#E4E4E7] rounded-xl p-6">
        <p className="text-sm text-[#DC2626]">Failed to load payments.</p>
      </div>
    );
  }

  const { payments, total } = result;
  const totalPages = Math.ceil(total / limit);

  if (payments.length === 0) {
    return (
      <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
        <EmptyState
          icon={<CreditCard className="h-5 w-5" aria-hidden />}
          title="No payments found"
          description={
            search || method || dateFrom || dateTo
              ? "No payments match your filters."
              : "No payment records yet."
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Payment List */}
      <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#09090B]">Payment Records</h2>
            <p className="text-xs text-[#71717A] mt-0.5">
              Showing {payments.length} of {total} total
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#FAFAFA] border-b border-[#E4E4E7]">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-[#71717A] uppercase tracking-wider">
                  Date
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-[#71717A] uppercase tracking-wider">
                  Patient
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-[#71717A] uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-[#71717A] uppercase tracking-wider">
                  Method
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-[#71717A] uppercase tracking-wider">
                  Notes
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium text-[#71717A] uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4F4F5]">
              {payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-[#FAFAFA] transition-colors">
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className="text-sm text-[#09090B]">
                      {formatDate(payment.payment_date)}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`${basePath}/patients/${payment.patient.id}`}
                      className="text-sm font-medium text-[#09090B] hover:underline underline-offset-4"
                    >
                      {payment.patient.name}
                    </Link>
                    {payment.patient.phone && (
                      <p className="text-xs text-[#A1A1AA]">{payment.patient.phone}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className="text-sm font-semibold text-[#16A34A]">
                      {formatCurrency(payment.amount)}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F4F4F5] text-[#52525B]">
                      {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {payment.notes ? (
                      <span className="text-sm text-[#71717A] line-clamp-2">
                        {payment.notes}
                      </span>
                    ) : (
                      <span className="text-sm text-[#A1A1AA]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`${basePath}/patients/${payment.patient.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#71717A] hover:text-[#09090B] transition-colors"
                    >
                      View Patient
                      <ArrowRight className="h-3 w-3" aria-hidden />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4">
          <p className="text-sm text-[#71717A]">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigateToPage(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigateToPage(page + 1)}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
