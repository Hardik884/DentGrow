/**
 * components/dental-chart/ToothDetailPanel.tsx
 *
 * Click-a-tooth panel: current status/condition/notes (editable), linked
 * treatments (existing treatment records — never duplicated here, just
 * listed and opened via the shared TreatmentDetailDialog), and the tooth's
 * append-only change history.
 *
 * Built on the existing Dialog primitive (centered modal) — there is no
 * Sheet/side-panel component in this codebase to reuse instead.
 */

"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TreatmentDetailDialog } from "@/components/dentist/TreatmentDetailModal";
import { TreatmentFormDialog } from "@/components/dentist/TreatmentFormDialog";
import { upsertToothState } from "@/actions/dental-chart";
import { TOOTH_STATUS_LABELS } from "@/lib/dental-chart/status";
import { TOOTH_STATUS_ORDER } from "@/lib/dental-chart/teeth";
import { TREATMENT_STATUS_LABELS, formatCurrency, formatDateTime } from "@/lib/utils";
import { Stethoscope, History as HistoryIcon } from "lucide-react";
import type { ToothChartEntry, ToothHistory, DentitionType, ToothStatus } from "@/types";

export type ToothDetailPanelProps = {
  open: boolean;
  onClose: () => void;
  entry: ToothChartEntry | null;
  patientId: string;
  patientName?: string;
  appointmentId?: string;
  dentitionType: DentitionType;
  /** Called after a save (status/condition/notes, or a linked treatment) so the parent can refetch the chart. */
  onSaved: () => void;
};

export function ToothDetailPanel({
  open,
  onClose,
  entry,
  patientId,
  patientName,
  appointmentId,
  dentitionType,
  onSaved,
}: ToothDetailPanelProps) {
  const [status, setStatus] = useState<ToothStatus>("normal");
  const [condition, setCondition] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingTreatmentId, setViewingTreatmentId] = useState<string | null>(null);

  useEffect(() => {
    if (!entry) return;
    setStatus(entry.tooth?.status ?? "normal");
    setCondition(entry.tooth?.condition ?? "");
    setNotes(entry.tooth?.notes ?? "");
    setError(null);
  }, [entry]);

  if (!entry) return null;

  async function handleSave() {
    if (!entry) return;
    setSaving(true);
    setError(null);
    const result = await upsertToothState({
      patient_id: patientId,
      dentition_type: dentitionType,
      tooth_number: entry.toothNumber,
      status,
      condition,
      notes,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} title={`Tooth ${entry.toothNumber}`} size="md">
        <div className="p-5 space-y-5">
          {error && (
            <div className="rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-3 py-2 text-xs text-[#DC2626]">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <Field label="Status" htmlFor="tooth-status">
              <Select
                id="tooth-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ToothStatus)}
              >
                {TOOTH_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {TOOTH_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Condition" htmlFor="tooth-condition" hint="e.g. Caries, Fractured cusp">
              <Input
                id="tooth-condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                placeholder="Optional clinical condition"
              />
            </Field>

            <Field label="Notes" htmlFor="tooth-notes">
              <Textarea
                id="tooth-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional chart note"
              />
            </Field>

            <div className="flex justify-end">
              <Button size="sm" onClick={handleSave} isLoading={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          <div className="border-t border-[#F4F4F5] pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#09090B] uppercase tracking-wide flex items-center gap-1.5">
                <Stethoscope className="h-3.5 w-3.5 text-[#71717A]" aria-hidden />
                Linked Treatments
              </h3>
              <TreatmentFormDialog
                appointmentId={appointmentId}
                patientId={patientId}
                toothNumber={entry.toothNumber}
                dentitionType={dentitionType}
                title={`Add Treatment — Tooth ${entry.toothNumber}`}
                triggerVariant="outline"
                triggerSize="xs"
                patientName={patientName}
                onClose={onSaved}
              >
                Add Treatment
              </TreatmentFormDialog>
            </div>

            {entry.treatments.length === 0 ? (
              <p className="text-xs text-[#A1A1AA]">No treatments linked to this tooth yet.</p>
            ) : (
              <ul className="divide-y divide-[#F4F4F5] border border-[#E4E4E7] rounded-lg overflow-hidden">
                {entry.treatments.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setViewingTreatmentId(t.id)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[#FAFAFA] transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm text-[#09090B] truncate">{t.treatment_type}</span>
                        <span className="block text-[11px] text-[#71717A]">
                          {t.performed_at ? formatDateTime(t.performed_at) : "Not yet performed"}
                          {" · "}
                          {formatCurrency(Number(t.cost))}
                        </span>
                      </span>
                      <StatusBadge
                        label={TREATMENT_STATUS_LABELS[t.status]}
                        variant={
                          t.status === "completed" ? "success" : t.status === "in_progress" ? "info" : t.status === "cancelled" ? "error" : "default"
                        }
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-[#F4F4F5] pt-4 space-y-2">
            <h3 className="text-xs font-semibold text-[#09090B] uppercase tracking-wide flex items-center gap-1.5">
              <HistoryIcon className="h-3.5 w-3.5 text-[#71717A]" aria-hidden />
              History
            </h3>
            {entry.history.length === 0 ? (
              <p className="text-xs text-[#A1A1AA]">No chart history yet.</p>
            ) : (
              <ul className="space-y-2">
                {entry.history.map((h) => (
                  <HistoryRow key={h.id} history={h} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </Dialog>

      <TreatmentDetailDialog
        treatmentId={viewingTreatmentId}
        open={!!viewingTreatmentId}
        onClose={() => setViewingTreatmentId(null)}
      />
    </>
  );
}

function HistoryRow({ history }: { history: ToothHistory }) {
  const oldValue = history.old_value as { status?: string } | null;
  const newValue = history.new_value as { status?: string; condition?: string; notes?: string } | null;

  let summary = "Updated";
  if (history.action === "status_changed" && newValue?.status) {
    summary = oldValue?.status
      ? `Status: ${TOOTH_STATUS_LABELS[oldValue.status as ToothStatus] ?? oldValue.status} → ${TOOTH_STATUS_LABELS[newValue.status as ToothStatus] ?? newValue.status}`
      : `Status set to ${TOOTH_STATUS_LABELS[newValue.status as ToothStatus] ?? newValue.status}`;
  } else if (history.action === "treatment_linked") {
    summary = `Linked to a treatment${newValue?.status ? ` — status ${TOOTH_STATUS_LABELS[newValue.status as ToothStatus] ?? newValue.status}` : ""}`;
  } else if (history.action === "condition_updated") {
    summary = newValue?.condition ? `Condition noted: ${newValue.condition}` : "Condition updated";
  } else if (history.action === "note_added") {
    summary = "Note updated";
  }

  return (
    <li className="text-xs text-[#52525B] flex items-start gap-2">
      <span className="text-[#A1A1AA] tabular-nums shrink-0">{formatDateTime(history.timestamp)}</span>
      <span className="min-w-0">{summary}</span>
    </li>
  );
}
