import { getPatientTreatmentHistory } from "@/actions/treatments";
import { TREATMENT_STATUS_LABELS, formatDate, formatCurrency } from "@/lib/utils";
import type { TreatmentHistoryItem, TreatmentStatus } from "@/types";

interface AppointmentPatientHistorySectionProps {
  patientId: string;
  /** The appointment currently being viewed — its treatments are excluded. */
  currentAppointmentId: string;
}

const STATUS_STYLES: Record<TreatmentStatus, string> = {
  planned: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

/**
 * AppointmentPatientHistorySection
 *
 * Server Component — "Past Treatment History" block on the appointment detail
 * page. Shows the patient's previous treatments (newest first), excluding the
 * treatments recorded against the appointment currently being viewed.
 *
 * Clinic isolation and soft-delete filtering are enforced in the server action.
 */
export async function AppointmentPatientHistorySection({
  patientId,
  currentAppointmentId,
}: AppointmentPatientHistorySectionProps) {
  const result = await getPatientTreatmentHistory(patientId);
  const all = (result.data ?? []) as TreatmentHistoryItem[];
  const history = all.filter((t) => t.appointment_id !== currentAppointmentId);

  return (
    <div className="bg-white border rounded-lg p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900">Past Treatment History</h3>
        {history.length > 0 && (
          <p className="text-xs text-gray-500 mt-0.5">
            {history.length} previous treatment{history.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {result.error && <p className="text-sm text-red-600">{result.error}</p>}

      {history.length === 0 ? (
        <p className="text-sm text-gray-400">No previous treatments for this patient.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((t) => {
            const status = t.status as TreatmentStatus;
            return (
              <li
                key={t.id}
                className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {t.treatment_type}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(t.performed_at ?? t.created_at)}
                      {t.dentistName && (
                        <span className="text-gray-400"> · {t.dentistName}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-medium text-gray-900">
                      {formatCurrency(Number(t.cost ?? 0))}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {TREATMENT_STATUS_LABELS[status] ?? status}
                    </span>
                  </div>
                </div>
                {t.patient_visible_notes && (
                  <p className="text-xs text-gray-600 mt-1.5 whitespace-pre-wrap">
                    {t.patient_visible_notes}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
