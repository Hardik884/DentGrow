import Link from "next/link";
import { getPatientsWithOutstandingBalance } from "@/actions/payments";
import { formatCurrency } from "@/lib/utils";

/**
 * PendingPaymentsList
 *
 * Server Component — list of patients with outstanding balance > 0.
 * Used on receptionist payments page and dashboard.
 * Balance computed server-side: SUM(treatments.cost) - SUM(payments.amount).
 */
export async function PendingPaymentsList() {
  const result = await getPatientsWithOutstandingBalance();
  const pendingPatients = result.data ?? [];

  return (
    <div className="bg-white border rounded-lg p-4">
      <h2 className="font-semibold text-gray-900 mb-3">
        Outstanding Balances
        {pendingPatients.length > 0 && (
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
            {pendingPatients.length}
          </span>
        )}
      </h2>

      {result.error && (
        <p className="text-sm text-red-600">{result.error}</p>
      )}

      {pendingPatients.length === 0 ? (
        <p className="text-sm text-gray-500">No outstanding balances.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {pendingPatients.map((patient) => (
            <li key={patient.id} className="flex items-center justify-between py-2">
              <div>
                <Link
                  href={`/receptionist/patients/${patient.id}`}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  {patient.name}
                </Link>
                {patient.phone && (
                  <p className="text-xs text-gray-400">{patient.phone}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-red-600">
                  {formatCurrency(patient.balance)}
                </span>
                <Link
                  href={`/receptionist/payments/new?patient=${patient.id}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Record
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
