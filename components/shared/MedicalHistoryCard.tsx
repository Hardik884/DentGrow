"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAppointmentClinical } from "@/actions/appointments";
import type { MedicalHistory } from "@/types";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface MedicalHistoryCardProps {
  appointmentId: string;
  /** Raw appointments.medical_history jsonb value. */
  initial: unknown;
  canEdit: boolean;
}

const EMPTY: MedicalHistory = {
  hypertension: false,
  diabetes: false,
  pregnancy_lactation: false,
  drug_allergies: false,
  thyroid_disorders: false,
  notes: "",
};

const CHECKS: { key: keyof Omit<MedicalHistory, "notes">; label: string }[] = [
  { key: "hypertension", label: "Hypertension (BP)" },
  { key: "diabetes", label: "Diabetes" },
  { key: "pregnancy_lactation", label: "Pregnancy / Lactation" },
  { key: "drug_allergies", label: "Drug Allergies" },
  { key: "thyroid_disorders", label: "Thyroid Disorders" },
];

function normalize(raw: unknown): MedicalHistory {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    return {
      hypertension: !!r.hypertension,
      diabetes: !!r.diabetes,
      pregnancy_lactation: !!r.pregnancy_lactation,
      drug_allergies: !!r.drug_allergies,
      thyroid_disorders: !!r.thyroid_disorders,
      notes: typeof r.notes === "string" ? r.notes : "",
    };
  }
  return { ...EMPTY };
}

/**
 * MedicalHistoryCard
 *
 * Quick-select medical flags (BP / Diabetes / Pregnancy-Lactation) plus a
 * free-text "Additional Medical Notes" field. Editable by receptionist and
 * dentist. Saves via updateAppointmentClinical.
 */
export function MedicalHistoryCard({ appointmentId, initial, canEdit }: MedicalHistoryCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const initialValue = normalize(initial);
  const [saved, setSaved] = useState<MedicalHistory>(initialValue);
  const [value, setValue] = useState<MedicalHistory>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty =
    value.hypertension !== saved.hypertension ||
    value.diabetes !== saved.diabetes ||
    value.pregnancy_lactation !== saved.pregnancy_lactation ||
    value.drug_allergies !== saved.drug_allergies ||
    value.thyroid_disorders !== saved.thyroid_disorders ||
    value.notes.trim() !== saved.notes.trim();

  function toggle(key: keyof Omit<MedicalHistory, "notes">) {
    setJustSaved(false);
    setValue((v) => ({ ...v, [key]: !v[key] }));
  }

  function save() {
    setError(null);
    const payload: MedicalHistory = { ...value, notes: value.notes.trim() };
    startTransition(async () => {
      const res = await updateAppointmentClinical(appointmentId, { medical_history: payload });
      if (res.error) {
        setError(res.error);
        return;
      }
      setSaved(payload);
      setValue(payload);
      setJustSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#09090B]">Medical History</h3>
        {canEdit && dirty && (
          <Button size="sm" onClick={save} isLoading={isPending} disabled={isPending}>
            <Check className="h-3.5 w-3.5" aria-hidden />
            Save
          </Button>
        )}
        {canEdit && !dirty && justSaved && (
          <span className="inline-flex items-center gap-1 text-xs text-[#16A34A]">
            <Check className="h-3 w-3" aria-hidden />
            Saved
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {CHECKS.map(({ key, label }) => (
          <label
            key={key}
            className={`inline-flex items-center gap-2 text-sm ${
              canEdit ? "cursor-pointer text-[#09090B]" : "text-[#3F3F46]"
            }`}
          >
            <input
              type="checkbox"
              checked={value[key]}
              onChange={() => toggle(key)}
              disabled={!canEdit || isPending}
              className="h-4 w-4 rounded border-[#D4D4D8] accent-[#18181B] focus:ring-1 focus:ring-[#18181B]"
            />
            {label}
          </label>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-[#71717A]">Additional Medical Notes</p>
        {canEdit ? (
          <Textarea
            rows={3}
            value={value.notes}
            onChange={(e) => {
              setValue((v) => ({ ...v, notes: e.target.value }));
              setJustSaved(false);
            }}
            placeholder="e.g. Allergy to Penicillin, Heart Disease, Current Medication, Asthma…"
            disabled={isPending}
          />
        ) : (
          <p className="text-sm text-[#3F3F46] whitespace-pre-wrap">
            {saved.notes ? saved.notes : <span className="text-[#A1A1AA]">None recorded</span>}
          </p>
        )}
      </div>

      {error && (
        <p className="text-xs text-[#DC2626]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
