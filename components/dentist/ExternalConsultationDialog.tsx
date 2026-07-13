"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { recordConsultancyIncome } from "@/actions/consultants";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button, type ButtonVariant, type ButtonSize } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { getBackdateFloor } from "@/lib/utils";

interface ExternalConsultationDialogProps {
  /** Class names applied to the trigger button. */
  triggerClassName?: string;
  /** When set, the trigger renders via the shared Button for consistent styling. */
  triggerVariant?: ButtonVariant;
  /** Trigger Button size (only used with triggerVariant). Defaults to "sm". */
  triggerSize?: ButtonSize;
  /** Trigger button content. */
  children: ReactNode;
}

/**
 * ExternalConsultationDialog
 *
 * Inline launcher for recording external consultancy income. Opens the shared
 * centered Dialog (identical UX to Appointments / Treatments / Payments /
 * Follow-ups) and reuses the existing recordConsultancyIncome server action —
 * no duplicated calculation, no duplicated persistence logic. Recording never
 * creates a patient, appointment, or clinic payment.
 */
export function ExternalConsultationDialog({
  triggerClassName,
  triggerVariant,
  triggerSize = "sm",
  children,
}: ExternalConsultationDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [clinic, setClinic] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  function resetForm() {
    setDate("");
    setClinic("");
    setDescription("");
    setAmount("");
    setNotes("");
    setError(null);
  }

  function close() {
    if (isPending) return;
    setOpen(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await recordConsultancyIncome({
        date,
        external_clinic: clinic.trim() || undefined,
        description: description.trim() || undefined,
        amount: Number(amount),
        notes: notes.trim() || undefined,
      });
      if (res.error || !res.data) {
        setError(res.error ?? "Failed to record external consultation.");
        return;
      }
      resetForm();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {triggerVariant ? (
        <Button
          type="button"
          variant={triggerVariant}
          size={triggerSize}
          className={triggerClassName}
          onClick={() => setOpen(true)}
        >
          {children}
        </Button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
          {children}
        </button>
      )}

      <Dialog
        open={open}
        onClose={close}
        title="Add External Consultation"
        description="Record income earned at another clinic. This is tracked separately from clinic payments."
        size="lg"
        busy={isPending}
      >
        <div className="p-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs text-[#DC2626]"
            >
              {error}
            </div>
          )}

          <Field label="Date" htmlFor="ext-date" required>
            <CalendarPicker id="ext-date" value={date} min={getBackdateFloor()} onChange={setDate} placeholder="Select date" clearable />
          </Field>

          <Field label="Clinic Name" htmlFor="ext-clinic">
            <Input
              id="ext-clinic"
              value={clinic}
              onChange={(e) => setClinic(e.target.value)}
              placeholder="e.g. Smile Care Dental"
            />
          </Field>

          <Field label="Treatment Performed" htmlFor="ext-desc">
            <Input
              id="ext-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Root canal consultation"
            />
          </Field>

          <Field label="Amount Earned (₹)" htmlFor="ext-amount" required>
            <Input
              id="ext-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>

          <Field label="Notes" htmlFor="ext-notes">
            <Textarea
              id="ext-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </Field>
        </div>

        <div className="px-6 py-4 bg-[#FAFAFA] border-t border-[#E4E4E7] flex items-center justify-end gap-3">
          <Button type="button" variant="outline" size="sm" onClick={close} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={save} isLoading={isPending} disabled={isPending}>
            Save
          </Button>
        </div>
      </Dialog>
    </>
  );
}
