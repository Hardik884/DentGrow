import { getPatientTreatmentHistory } from "@/actions/treatments";
import { getClinicSettings } from "@/actions/clinic-settings";
import { TreatmentHistoryList } from "@/components/dentist/TreatmentHistoryList";
import type { TreatmentHistoryItem } from "@/types";

interface AppointmentPatientHistorySectionProps {
  patientId: string;
  /** The appointment currently being viewed — its treatments are excluded. */
  currentAppointmentId: string;
}

/**
 * AppointmentPatientHistorySection
 *
 * Server Component — "Past Treatment History" block. Shows the patient's
 * previous treatments (newest first), excluding the treatments recorded against
 * the appointment currently being viewed. Each entry is clickable and opens a
 * centered read-only dialog (TreatmentHistoryList).
 *
 * Clinic isolation and soft-delete filtering are enforced in the server action.
 */
export async function AppointmentPatientHistorySection({
  patientId,
  currentAppointmentId,
}: AppointmentPatientHistorySectionProps) {
  const [result, settingsResult] = await Promise.all([
    getPatientTreatmentHistory(patientId),
    getClinicSettings(),
  ]);
  const all = (result.data ?? []) as TreatmentHistoryItem[];
  const history = all.filter((t) => t.appointment_id !== currentAppointmentId);
  const registrationNumber = settingsResult.data?.registration_number ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-text-primary">Past Treatment History</h3>
        {history.length > 0 && (
          <p className="text-xs text-text-secondary mt-0.5">
            {history.length} previous treatment{history.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {result.error && <p className="text-sm text-danger">{result.error}</p>}

      {history.length === 0 ? (
        <p className="text-sm text-text-disabled">No previous treatments for this patient.</p>
      ) : (
        <TreatmentHistoryList items={history} registrationNumber={registrationNumber} />
      )}
    </div>
  );
}
