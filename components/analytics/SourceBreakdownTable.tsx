import type { SourceBreakdownItem } from "@/lib/analytics/queries";
import { formatCurrency } from "@/lib/utils";

interface SourceBreakdownTableProps {
  data: SourceBreakdownItem[];
}

/**
 * SourceBreakdownTable — tabular view of patients + revenue by acquisition source.
 * Server component.
 */
export function SourceBreakdownTable({ data }: SourceBreakdownTableProps) {
  if (!data.length || data.every((d) => d.patientCount === 0 && d.revenue === 0)) {
    return (
      <div className="text-sm text-gray-400 py-6 text-center">
        No source data for selected period
      </div>
    );
  }

  const totalPatients = data.reduce((s, d) => s + d.patientCount, 0);
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="pb-2 font-medium text-gray-500">Source</th>
            <th className="pb-2 font-medium text-gray-500 text-right">Patients</th>
            <th className="pb-2 font-medium text-gray-500 text-right">% of Total</th>
            <th className="pb-2 font-medium text-gray-500 text-right">Revenue</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map((row) => (
            <tr key={row.source}>
              <td className="py-2 font-medium text-gray-800">{row.label}</td>
              <td className="py-2 text-right text-gray-700">{row.patientCount}</td>
              <td className="py-2 text-right text-gray-500">
                {totalPatients > 0
                  ? `${Math.round((row.patientCount / totalPatients) * 100)}%`
                  : "—"}
              </td>
              <td className="py-2 text-right text-gray-700">
                {row.revenue > 0 ? formatCurrency(row.revenue) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-semibold">
            <td className="pt-2 text-gray-800">Total</td>
            <td className="pt-2 text-right text-gray-800">{totalPatients}</td>
            <td className="pt-2 text-right text-gray-500">100%</td>
            <td className="pt-2 text-right text-gray-800">{formatCurrency(totalRevenue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
