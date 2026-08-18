/**
 * components/dental-chart/BulkUpdateTeethDialog.tsx
 *
 * Multi-select action: apply the same status/condition/notes to every
 * selected tooth in one call — useful for procedures spanning multiple
 * teeth (e.g. scaling across a quadrant, a bridge span). Deliberately kept
 * to chart-state fields only, not a form for creating N separate treatment
 * records — that stays a per-tooth action from the detail panel so cost,
 * medications, and billing are never silently duplicated across teeth.
 */

"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { bulkUpdateTeeth } from "@/actions/dental-chart";
import { TOOTH_STATUS_LABELS } from "@/lib/dental-chart/status";
import { TOOTH_STATUS_ORDER } from "@/lib/dental-chart/teeth";
import type { DentitionType, ToothStatus } from "@/types";

export type BulkUpdateTeethDialogProps = {
  open: boolean;
  onClose: () => void;
  patientId: string;
  dentitionType: DentitionType;
  toothNumbers: number[];
  onSaved: () => void;
};

export function BulkUpdateTeethDialog({
  open,
  onClose,
  patientId,
  dentitionType,
  toothNumbers,
  onSaved,
}: BulkUpdateTeethDialogProps) {
  const [status, setStatus] = useState<ToothStatus>("recommended");
  const [condition, setCondition] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await bulkUpdateTeeth({
      patient_id: patientId,
      dentition_type: dentitionType,
      tooth_numbers: toothNumbers,
      status,
      condition,
      notes,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCondition("");
    setNotes("");
    onSaved();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Update ${toothNumbers.length} Selected Teeth`}
      description={toothNumbers.slice().sort((a, b) => a - b).join(", ")}
      size="sm"
    >
      <div className="p-5 space-y-4">
        {error && (
          <div className="rounded-lg bg-danger-bg border border-danger-border px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        <Field label="Status" htmlFor="bulk-status">
          <Select id="bulk-status" value={status} onChange={(e) => setStatus(e.target.value as ToothStatus)}>
            {TOOTH_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {TOOTH_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Condition" htmlFor="bulk-condition">
          <Input
            id="bulk-condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            placeholder="Optional — applied to every selected tooth"
          />
        </Field>

        <Field label="Notes" htmlFor="bulk-notes">
          <Textarea
            id="bulk-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — applied to every selected tooth"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} isLoading={saving}>
            {saving ? "Saving…" : `Apply to ${toothNumbers.length} Teeth`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
