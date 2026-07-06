"use client";

import { useState, useTransition } from "react";
import type { ConsultancyIncome } from "@/types";
import { recordConsultancyIncome, deleteConsultancyIncome } from "@/actions/consultants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Briefcase, Plus, Trash2, X } from "lucide-react";

interface ConsultancyIncomePanelProps {
  initial: ConsultancyIncome[];
}

/**
 * Record and review external consultancy income. This never creates a patient,
 * appointment, or clinic payment — it is tracked separately as part of the
 * dentist's total income.
 */
export function ConsultancyIncomePanel({ initial }: ConsultancyIncomePanelProps) {
  const [items, setItems] = useState<ConsultancyIncome[]>(initial);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [clinic, setClinic] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const total = items.reduce((sum, i) => sum + Number(i.amount ?? 0), 0);

  function resetForm() {
    setDate("");
    setClinic("");
    setDescription("");
    setAmount("");
    setNotes("");
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await recordConsultancyIncome({
        date,
        external_clinic: clinic.trim(),
        description: description.trim(),
        amount: Number(amount),
        notes: notes.trim() || undefined,
      });
      if (res.error || !res.data) {
        setError(res.error ?? "Failed to record consultancy income.");
        return;
      }
      setItems((prev) => [res.data!, ...prev]);
      resetForm();
      setOpen(false);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteConsultancyIncome(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
    });
  }

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-[#F4F4F5] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <Briefcase className="h-4 w-4 text-[#71717A]" aria-hidden />
            <h3 className="text-sm font-semibold text-[#09090B]">Consultancy Income</h3>
          </div>
          <p className="text-xs text-[#71717A] mt-0.5">
            External earnings from consulting at other clinics. {formatCurrency(total)} total.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Record Consultancy Income
        </Button>
      </div>

      <div className="px-6 py-5">
        {items.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="h-5 w-5" aria-hidden />}
            title="No consultancy income"
            description="Record earnings from external clinics to track your total income."
          />
        ) : (
          <div className="divide-y divide-[#F4F4F5] border border-[#F4F4F5] rounded-lg">
            {items.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#09090B] truncate">
                    {i.external_clinic} · {formatCurrency(Number(i.amount))}
                  </p>
                  <p className="text-xs text-[#71717A] truncate">
                    {formatDate(i.date)} · {i.description}
                    {i.notes ? ` · ${i.notes}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i.id)}
                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg border border-[#E4E4E7] text-[#DC2626] hover:bg-[#FEF2F2]"
                  aria-label="Delete consultancy income"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="consultancy-income-title"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-xl border border-[#E4E4E7] shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#E4E4E7] px-6 py-4 flex items-center justify-between">
              <h2 id="consultancy-income-title" className="text-base font-semibold text-[#09090B]">
                Record Consultancy Income
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-lg hover:bg-[#F4F4F5] flex items-center justify-center"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-[#71717A]" aria-hidden />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div role="alert" className="rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs text-[#DC2626]">
                  {error}
                </div>
              )}

              <Field label="Date" htmlFor="ci-date" required>
                <CalendarPicker id="ci-date" value={date} onChange={setDate} placeholder="Select date" clearable />
              </Field>

              <Field label="Clinic Name" htmlFor="ci-clinic" required>
                <Input
                  id="ci-clinic"
                  value={clinic}
                  onChange={(e) => setClinic(e.target.value)}
                  placeholder="e.g. Smile Care Dental"
                />
              </Field>

              <Field label="Treatment / Description" htmlFor="ci-desc" required>
                <Input
                  id="ci-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Root canal consultation"
                />
              </Field>

              <Field label="Amount Earned (₹)" htmlFor="ci-amount" required>
                <Input
                  id="ci-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </Field>

              <Field label="Notes" htmlFor="ci-notes">
                <Textarea
                  id="ci-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional"
                />
              </Field>
            </div>

            <div className="px-6 py-4 bg-[#FAFAFA] flex items-center justify-end gap-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={save} isLoading={isPending} disabled={isPending}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
