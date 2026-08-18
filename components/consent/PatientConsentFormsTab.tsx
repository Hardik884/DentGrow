import { getConsentsForPatient } from "@/actions/consents";
import { getConsentTemplates } from "@/actions/consent-templates";
import { getTreatmentsForPatient } from "@/actions/treatments";
import { getPatient } from "@/actions/patients";
import { ConsentFormsPanel } from "@/components/consent/ConsentFormsPanel";
import type { Treatment, TreatmentForReceptionist } from "@/types";

interface PatientConsentFormsTabProps {
  patientId: string;
  role: "dentist" | "receptionist";
  baseHref: string;
}

/**
 * PatientConsentFormsTab — Server Component.
 *
 * Lists this patient's consent forms only (staff), and hosts the client panel
 * for view / sign / edit / upload. Scoped entirely server-side to the caller's
 * clinic; a patient's forms are never mixed with another patient's.
 */
export async function PatientConsentFormsTab({ patientId, role, baseHref }: PatientConsentFormsTabProps) {
  const [consentsRes, templatesRes, treatmentsRes, patientRes] = await Promise.all([
    getConsentsForPatient(patientId),
    getConsentTemplates(),
    getTreatmentsForPatient(patientId),
    getPatient(patientId),
  ]);

  const consents = consentsRes.data ?? [];
  const templates = (templatesRes.data ?? []).map((t) => ({ key: t.template_key, name: t.name }));
  const treatments = ((treatmentsRes.data ?? []) as (Treatment | TreatmentForReceptionist)[]).map((t) => ({
    id: t.id,
    treatment_type: t.treatment_type,
    appointment_id: t.appointment_id,
  }));
  const patient = patientRes.data;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-text-primary">Consent Forms</h3>
        <p className="text-xs text-text-secondary mt-0.5">
          Informed-consent documents for this patient — digitally signed in DentGrow or uploaded
          after being signed on paper.
        </p>
      </div>

      {consentsRes.error && (
        <p className="text-sm text-danger bg-danger-bg border border-danger-border rounded-md px-3 py-2">
          {consentsRes.error}
        </p>
      )}

      <ConsentFormsPanel
        patientId={patientId}
        patientName={patient?.name ?? "Patient"}
        patientPhone={patient?.phone ?? null}
        role={role}
        baseHref={baseHref}
        initialConsents={consents}
        templates={templates}
        treatments={treatments}
      />
    </div>
  );
}
