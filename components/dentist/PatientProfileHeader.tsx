import Link from "next/link";
import { notFound } from "next/navigation";
import { getPatient } from "@/actions/patients";
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { DeletePatientButton } from "@/components/dentist/DeletePatientButton";
import { formatDate, formatCurrency, calculateAge } from "@/lib/utils";

interface PatientProfileHeaderProps {
  patientId: string;
  /** Role determines which actions are rendered */
  role: "dentist" | "receptionist";
  /** Base route for edit link: "/dentist" | "/receptionist" */
  baseHref: string;
}

/**
 * PatientProfileHeader
 *
 * Server Component — fetches patient data and renders the demographics
 * header at the top of the patient profile page.
 *
 * Dentist view: shows all fields, edit + delete buttons, balance, notes.
 * Receptionist view: shows operational fields, edit button only (no delete, no notes).
 *
 * Age is calculated from date_of_birth — never stored.
 */
export async function PatientProfileHeader({
  patientId,
  role,
  baseHref,
}: PatientProfileHeaderProps) {
  const result = await getPatient(patientId);

  if (!result.data) notFound();

  const patient = result.data;
  const age = calculateAge(patient.date_of_birth);
  const isDentist = role === "dentist";

  const genderLabel = patient.gender
    ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)
    : null;

  return (
    <div className="bg-white border rounded-lg p-6 space-y-4">
      {/* ── Top row: avatar + name + actions ─────────────────────── */}
      <div className="flex items-start gap-4">
        <PatientAvatar name={patient.name} size="lg" />

        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-gray-900">{patient.name}</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-600">
            {age !== null && <span>{age} years old</span>}
            {genderLabel && <span>{genderLabel}</span>}
            {patient.phone && (
              <a
                href={`tel:${patient.phone}`}
                className="text-blue-600 hover:underline"
              >
                {patient.phone}
              </a>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`${baseHref}/patients/${patientId}/edit`}
            className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Edit
          </Link>
          {isDentist && (
            <DeletePatientButton
              patientId={patientId}
              patientName={patient.name}
            />
          )}
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t">
        <Stat label="Total Visits" value={String(patient.total_visits)} />
        <Stat label="Last Visit" value={formatDate(patient.last_visit)} />
        {isDentist && (
          <Stat
            label="Outstanding Balance"
            value={formatCurrency(patient.outstandingBalance)}
            valueClass={patient.outstandingBalance > 0 ? "text-red-600" : "text-green-600"}
          />
        )}
        <Stat
          label="Patient Since"
          value={formatDate(patient.created_at)}
        />
      </div>

      {/* ── Secondary details ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-600">
        {patient.date_of_birth && (
          <Detail label="Date of Birth" value={formatDate(patient.date_of_birth)} />
        )}
        {patient.address && (
          <Detail label="Address" value={patient.address} />
        )}
        {patient.emergency_contact_name && (
          <Detail
            label="Emergency Contact"
            value={`${patient.emergency_contact_name}${patient.emergency_contact_phone ? ` — ${patient.emergency_contact_phone}` : ""}`}
          />
        )}
      </div>

      {/* Notes — dentist only */}
      {isDentist && patient.notes && (
        <div className="pt-3 border-t">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Notes
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{patient.notes}</p>
        </div>
      )}

      {/* Pending follow-ups count */}
      {patient.pendingFollowUps.length > 0 && (
        <div className="pt-3 border-t flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            {patient.pendingFollowUps.length} pending follow-up
            {patient.pendingFollowUps.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-sm font-semibold mt-0.5 ${valueClass ?? "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-medium text-gray-500">{label}: </span>
      <span className="text-gray-700">{value}</span>
    </div>
  );
}
