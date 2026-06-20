import Link from "next/link";
import { notFound } from "next/navigation";
import { getPatient } from "@/actions/patients";
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { DeletePatientButton } from "@/components/dentist/DeletePatientButton";
import { formatDate, formatCurrency, calculateAge } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Phone, MapPin, AlertTriangle, Pencil, CalendarDays, Clock } from "lucide-react";

interface PatientProfileHeaderProps {
  patientId: string;
  role: "dentist" | "receptionist";
  baseHref: string;
}

export async function PatientProfileHeader({ patientId, role, baseHref }: PatientProfileHeaderProps) {
  const result = await getPatient(patientId);
  if (!result.data) notFound();

  const patient = result.data;
  const age = calculateAge(patient.date_of_birth);
  const isDentist = role === "dentist";
  const genderLabel = patient.gender
    ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)
    : null;

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="px-6 py-5 flex items-start gap-4">
        <PatientAvatar name={patient.name} size="lg" />

        <div className="flex-1 min-w-0 space-y-1">
          <h2 className="text-lg font-semibold text-[#09090B] tracking-tight">{patient.name}</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#71717A]">
            {age !== null && <span>{age} years</span>}
            {genderLabel && <span>{genderLabel}</span>}
            {patient.phone && (
              <a
                href={`tel:${patient.phone}`}
                className="flex items-center gap-1 text-[#09090B] hover:underline underline-offset-4"
              >
                <Phone className="h-3 w-3" aria-hidden />
                {patient.phone}
              </a>
            )}
          </div>
          {patient.pendingFollowUps.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1">
              <AlertTriangle className="h-3.5 w-3.5 text-[#CA8A04]" aria-hidden />
              <span className="text-xs text-[#CA8A04] font-medium">
                {patient.pendingFollowUps.length} pending follow-up{patient.pendingFollowUps.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild variant="outline" size="sm">
            <Link href={`${baseHref}/patients/${patientId}/edit`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </Link>
          </Button>
          {isDentist && (
            <DeletePatientButton patientId={patientId} patientName={patient.name} />
          )}
        </div>
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[#F4F4F5]">
        <StatCell
          label="Total Visits"
          value={String(patient.total_visits)}
          icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden />}
        />
        <StatCell
          label="Last Visit"
          value={formatDate(patient.last_visit)}
          icon={<Clock className="h-3.5 w-3.5" aria-hidden />}
        />
        {isDentist && (
          <StatCell
            label="Outstanding"
            value={formatCurrency(patient.outstandingBalance)}
            valueClass={patient.outstandingBalance > 0 ? "text-[#DC2626]" : "text-[#16A34A]"}
          />
        )}
        <StatCell
          label="Patient Since"
          value={formatDate(patient.created_at)}
        />
      </div>

      {/* Secondary info */}
      {(patient.address || patient.emergency_contact_name || (isDentist && patient.notes)) && (
        <>
          <Separator />
          <div className="px-6 py-4 space-y-2.5">
            {patient.address && (
              <div className="flex items-start gap-2 text-sm text-[#71717A]">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
                <span>{patient.address}</span>
              </div>
            )}
            {patient.emergency_contact_name && (
              <div className="flex items-center gap-2 text-sm text-[#71717A]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  Emergency: {patient.emergency_contact_name}
                  {patient.emergency_contact_phone ? ` · ${patient.emergency_contact_phone}` : ""}
                </span>
              </div>
            )}
            {isDentist && patient.notes && (
              <div className="mt-1">
                <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-[#09090B] whitespace-pre-wrap">{patient.notes}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  icon,
  valueClass,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-[#A1A1AA]">{icon}</span>}
        <p className="text-xs text-[#71717A]">{label}</p>
      </div>
      <p className={`text-sm font-semibold ${valueClass ?? "text-[#09090B]"}`}>{value}</p>
    </div>
  );
}
