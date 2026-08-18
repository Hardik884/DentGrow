"use client";

import { useState, useTransition } from "react";
import { updateAppointmentClinical } from "@/actions/appointments";
import type { UpdateAppointmentClinicalInput } from "@/types";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

type ClinicalTextField = "chief_complaints" | "oral_findings" | "provisional_diagnosis";

interface ClinicalTextCardProps {
  appointmentId: string;
  field: ClinicalTextField;
  title: string;
  placeholder?: string;
  helpText?: string;
  examples?: string[];
  initialValue: string | null;
  /** When false the card is read-only (viewer has no edit permission). */
  canEdit: boolean;
  rows?: number;
}

/**
 * ClinicalTextCard
 *
 * Reusable inline-editable card for a single free-text consultation field on
 * the Patient Visit page (Chief Complaints, Oral & Radiographic Findings,
 * Provisional Diagnosis). Saves via updateAppointmentClinical — role/field
 * permissions are enforced server-side. Read-only when `canEdit` is false.
 */
export function ClinicalTextCard({
  appointmentId,
  field,
  title,
  placeholder,
  helpText,
  examples,
  initialValue,
  canEdit,
  rows = 4,
}: ClinicalTextCardProps) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(initialValue ?? "");
  const [value, setValue] = useState(initialValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = value.trim() !== saved.trim();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateAppointmentClinical(appointmentId, {
        [field]: value,
      } as UpdateAppointmentClinicalInput);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSaved(value);
      setJustSaved(true);
    });
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {canEdit && dirty && (
          <Button size="sm" onClick={save} isLoading={isPending} disabled={isPending}>
            <Check className="h-3.5 w-3.5" aria-hidden />
            Save
          </Button>
        )}
        {canEdit && !dirty && justSaved && (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <Check className="h-3 w-3" aria-hidden />
            Saved
          </span>
        )}
      </div>

      {helpText && <p className="text-xs text-text-secondary">{helpText}</p>}

      {canEdit ? (
        <Textarea
          rows={rows}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setJustSaved(false);
          }}
          placeholder={placeholder}
          disabled={isPending}
        />
      ) : (
        <p className="text-sm text-text-strong whitespace-pre-wrap">
          {saved ? saved : <span className="text-text-disabled">Not recorded</span>}
        </p>
      )}

      {canEdit && !value && examples && examples.length > 0 && (
        <ul className="space-y-0.5 text-xs text-text-disabled">
          {examples.map((ex) => (
            <li key={ex}>• {ex}</li>
          ))}
        </ul>
      )}

      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
