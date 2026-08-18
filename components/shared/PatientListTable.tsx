import Link from "next/link";
import { PatientAvatar } from "./PatientAvatar";
import { formatDate, calculateAge } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ACTION_BUTTON } from "@/lib/ui/action-styles";
import { Users, Eye } from "lucide-react";
import type { Patient } from "@/types";

interface PatientListTableProps {
  patients: Patient[];
  total: number;
  page: number;
  limit: number;
  baseHref: string;
  search?: string;
}

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
      <div className="bg-white border border-[#E3E9E6] rounded-xl">
        <EmptyState
          icon={<Users className="h-5 w-5" aria-hidden />}
          title={search ? "No patients found" : "No patients yet"}
          description={
            search
              ? `No patients match "${search}". Try a different search.`
              : "Patients are added through portal sign-up or when booking an appointment."
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border border-[#E3E9E6] rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patient</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Age / Gender</TableHead>
              <TableHead className="text-center">Visits</TableHead>
              <TableHead>Last Visit</TableHead>
              <TableHead className="sr-only">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map((patient) => {
              const age = calculateAge(patient.date_of_birth);
              const gender = patient.gender
                ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)
                : null;

              return (
                <TableRow key={patient.id}>
                  {/* Name + avatar */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <PatientAvatar name={patient.name} size="sm" />
                      <Link
                        href={`${baseHref}/patients/${patient.id}`}
                        className="font-medium text-[#151918] hover:underline underline-offset-4 transition-colors"
                      >
                        {patient.name}
                      </Link>
                    </div>
                  </TableCell>

                  <TableCell className="text-[#737A76]">
                    {patient.phone ?? <span className="text-[#CBD5D0]">—</span>}
                  </TableCell>

                  <TableCell className="text-[#737A76]">
                    {age !== null || gender ? (
                      <span>
                        {age !== null ? `${age}y` : "—"}
                        {gender ? ` · ${gender}` : ""}
                      </span>
                    ) : (
                      <span className="text-[#CBD5D0]">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-center text-[#737A76]">
                    {patient.total_visits}
                  </TableCell>

                  <TableCell className="text-[#737A76]">
                    {formatDate(patient.last_visit)}
                  </TableCell>

                  <TableCell className="text-right">
                    <Link
                      href={`${baseHref}/patients/${patient.id}`}
                      className={`${ACTION_BUTTON} justify-end`}
                    >
                      <Eye className="h-3 w-3" aria-hidden />
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-[#737A76]">
          <span>
            Showing {from}–{to} of {total} patients
          </span>
          <div className="flex items-center gap-1">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className="px-3 py-1.5 border border-[#E3E9E6] rounded-lg bg-white hover:bg-[#EEF2F0] transition-colors text-[#151918]"
              >
                ← Prev
              </Link>
            )}
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              if (p > totalPages) return null;
              return (
                <Link
                  key={p}
                  href={pageHref(p)}
                  className={`px-3 py-1.5 border rounded-lg transition-colors ${
                    p === page
                      ? "bg-[#0D6B5E] text-white border-[#0D6B5E]"
                      : "border-[#E3E9E6] bg-white hover:bg-[#EEF2F0] text-[#151918]"
                  }`}
                >
                  {p}
                </Link>
              );
            })}
            {page < totalPages && (
              <Link
                href={pageHref(page + 1)}
                className="px-3 py-1.5 border border-[#E3E9E6] rounded-lg bg-white hover:bg-[#EEF2F0] transition-colors text-[#151918]"
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
