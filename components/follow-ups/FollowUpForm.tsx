"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createFollowUp,
  updateFollowUp,
  completeFollowUp,
  cancelFollowUp,
} from "@/actions/follow-ups";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { FOLLOW_UP_STATUS_LABELS, formatDate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import Link from "next/link";
import { CheckCircle2, X } from "lucide-react";
import type { FollowUp } from "@/types";

interface FollowUpFormProps {
  followUpId?: string;
  patientId?: string;
  appointmentId?: string;
  treatmentId?: string;
  initialData?: FollowUp & { patient?: { id: string; name: string } };
  onSuccess?: () => void;
  role?: "dentist" | "receptionist";
}

export function FollowUpForm({
  followUpId,
  patientId,
  appointmentId,
  treatmentId,
  initialData,
  onSuccess,
  role = "dentist",
}: FollowUpFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [dueDate, setDueDate] = useState(initialData?.due_date ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const currentStatus = initialData?.status ?? null;
  const isPendingStatus = currentStatus === "pending";
  const isDentist = role === "dentist";
  const [confirmAction, setConfirmAction] = useState<"complete" | "cancel" | null>(null);
  const [isActioning, startActionTransition] = useTransition();

  useEffect(() => {
    if (initialData) {
      setDueDate(initialData.due_date);
      setNotes(initialData.notes ?? "");
    }
  }, [initialData]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    if (!dueDate) { setFormError("Due date is required."); return; }

    const input = {
      patient_id: patientId ?? initialData?.patient_id ?? "",
      appointment_id: appointmentId ?? initialData?.appointment_id ?? undefined,
      treatment_id: treatmentId ?? initialData?.treatment_id ?? undefined,
      due_date: dueDate,
      notes: notes.trim() || undefined,
    };

    startTransition(async () => {
      const result = followUpId ? await updateFollowUp(followUpId, input) : await createFollowUp(input);
      if (result.error) { setFormError(result.error); return; }
      setFormSuccess(followUpId ? "Follow-up updated." : "Follow-up created.");
      if (!followUpId && result.data) {
        router.push(`/dentist/follow-ups/${result.data.id}`);
        return;
      }
      onSuccess?.();
    });
  }

  function handleConfirm() {
    if (!followUpId || !confirmAction) return;
    setFormError(null);
    startActionTransition(async () => {
      const result = confirmAction === "complete"
        ? await completeFollowUp(followUpId)
        : await cancelFollowUp(followUpId);
      setConfirmAction(null);
      if (result.error) { setFormError(result.error); return; }
      router.refresh();
    });
  }

  const isEditable = !currentStatus || currentStatus === "pending";
  const isReadOnly = !isEditable || isPending;

  return (
    <>
      <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden max-w-xl">
        {/* Header */}
        {currentStatus && (
          <div className="px-6 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#09090B]">Follow-Up Details</h2>
            <StatusBadge
              label={FOLLOW_UP_STATUS_LABELS[currentStatus]}
              variant={
                currentStatus === "completed" ? "success"
                : currentStatus === "cancelled" ? "error"
                : "default"
              }
            />
          </div>
        )}

        <div className="px-6 py-5 space-y-4">
          {/* Patient reference */}
          {initialData?.patient && (
            <p className="text-xs text-[#71717A]">
              Patient:{" "}
              <Link
                href={`/dentist/patients/${initialData.patient.id}`}
                className="text-[#09090B] font-medium hover:underline underline-offset-4"
              >
                {initialData.patient.name}
              </Link>
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Due Date" htmlFor="due_date" required>
              <Input
                id="due_date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isReadOnly}
                required
              />
            </Field>

            <Field label="Notes" htmlFor="notes">
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isReadOnly}
                placeholder="e.g. Root canal review, crown placement check-up…"
              />
            </Field>

            {followUpId && initialData && (
              <div className="grid grid-cols-2 gap-3 text-xs text-[#71717A]">
                <div>
                  <span className="block font-medium text-[#09090B]">Created</span>
                  {formatDate(initialData.created_at)}
                </div>
                {initialData.updated_at !== initialData.created_at && (
                  <div>
                    <span className="block font-medium text-[#09090B]">Updated</span>
                    {formatDate(initialData.updated_at)}
                  </div>
                )}
              </div>
            )}

            {formError && (
              <div role="alert" className="rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs text-[#DC2626]">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div role="status" className="rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] px-4 py-3 text-xs text-[#16A34A] flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                {formSuccess}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              {isEditable && (
                <Button type="submit" size="sm" disabled={isReadOnly} isLoading={isPending}>
                  {isPending ? "Saving…" : followUpId ? "Save Changes" : "Create Follow-Up"}
                </Button>
              )}

              {isDentist && followUpId && isPendingStatus && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setConfirmAction("complete")}
                    disabled={isActioning}
                    className="bg-[#16A34A] hover:bg-[#15803D]"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Mark Complete
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmAction("cancel")}
                    disabled={isActioning}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === "complete" ? "Mark Follow-Up as Complete?" : "Cancel Follow-Up?"}
        description={
          confirmAction === "complete"
            ? "This will mark the follow-up as completed. This action cannot be undone."
            : "This will cancel the follow-up. This action cannot be undone."
        }
        confirmLabel={confirmAction === "complete" ? "Mark Complete" : "Cancel Follow-Up"}
        variant={confirmAction === "cancel" ? "danger" : "default"}
        cancelLabel="Go Back"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
        isLoading={isActioning}
      />
    </>
  );
}
