import Link from "next/link";
import { PatientAvatar } from "./PatientAvatar";
import { formatDate, calculateAge } from "@/lib/utils";
import type { Patient } from "@/types";

interface PatientListTableProps {
  patients: Patient[];
  total: number;
  page: number;
  limit: number;
  /** Base route prefix: "/dentist" or "/receptionist" */
  baseHref: string;
  /** Current search query string (for display) */
  search?: string;
}

/**
 * PatientListTable
 *
 * Server Component — renders a paginated table of patients.
 * Used by both dentist and receptionist patient list pages.
 * Links to the role-prefixed patient profile page.
 */
export function PatientListTable({
  patients,
  total,
  page,
  limit,
  baseHref,
  search,
}: PatientListTableProps) {
  const totalPages = Math.ceil(total / limit);
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  function pageHref(p: number) {
    const params = new URLSearchParams();
    params.set("page", String(p));
    if (search) params.set("search", search);
    return `?${params.toString()}`;
  }

  if (patients.length === 0) {
    return (
      <div className="bg-white border rounded-lg p-12 text-center">
        <p className="text-gray-500 text-sm">
          {search
            ? `No patients found matching "${search}".`
            : "No patients yet. Add your first patient to get started."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Age / Gender</th>
                <th className="px-4 py-3">Visits</th>
                <th className="px-4 py-3">Last Visit</th>
                <th className="px-4 py-3 sr-only">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {patients.map((patient) => {
                const age = calculateAge(patient.date_of_birth);
                const gender = patient.gender
                  ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)
                  : null;

                return (
                  <tr
                    key={patient.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    {/* Name + avatar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <PatientAvatar name={patient.name} size="sm" />
                        <Link
                          href={`${baseHref}/patients/${patient.id}`}
                          className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
                        >
                          {patient.name}
                        </Link>
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="px-4 py-3 text-gray-600">
                      {patient.phone ?? <span className="text-gray-400">—</span>}
                    </td>

                    {/* Age / Gender */}
                    <td className="px-4 py-3 text-gray-600">
                      {age !== null || gender ? (
                        <span>
                          {age !== null ? `${age} yrs` : "—"}
                          {gender ? ` · ${gender}` : ""}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Total visits */}
                    <td className="px-4 py-3 text-gray-600">
                      {patient.total_visits}
                    </td>

                    {/* Last visit */}
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(patient.last_visit)}
                    </td>

                    {/* View link */}
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`${baseHref}/patients/${patient.id}`}
                        className="text-blue-600 hover:underline text-xs font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Showing {from}–{to} of {total} patients
          </span>
          <div className="flex items-center gap-1">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className="px-3 py-1 border rounded-md hover:bg-gray-50 transition-colors"
              >
                ← Prev
              </Link>
            )}

            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              // Show pages around the current page
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              if (p > totalPages) return null;
              return (
                <Link
                  key={p}
                  href={pageHref(p)}
                  className={`px-3 py-1 border rounded-md transition-colors ${
                    p === page
                      ? "bg-blue-600 text-white border-blue-600"
                      : "hover:bg-gray-50"
                  }`}
                >
                  {p}
                </Link>
              );
            })}

            {page < totalPages && (
              <Link
                href={pageHref(page + 1)}
                className="px-3 py-1 border rounded-md hover:bg-gray-50 transition-colors"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
