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
import type { FollowUp } from "@/types";

interface FollowUpFormProps {
  /**
   * When provided the form loads an existing follow-up by this id.
   * Used on /dentist/follow-ups/[id] for edit + actions.
   */
  followUpId?: string;

  /**
   * When provided, the form pre-fills patient_id.
   * Used when creating from a patient profile.
   */
  patientId?: string;
  appointmentId?: string;
  treatmentId?: string;

  /** Initial follow-up data (passed from parent server component) */
  initialData?: FollowUp & { patient?: { id: string; name: string } };

  /** Called after successful create/update */
  onSuccess?: () => void;

  /** Role used to control which actions are shown */
  role?: "dentist" | "receptionist";
}

/**
 * FollowUpForm
 *
 * Client Component — follow-up create / edit form.
 *
 * Used on:
 *   - /dentist/follow-ups/[id] — edit + complete/cancel actions
 *   - Patient profile / inline creation (patientId prop)
 *   - Receptionist creation flow
 *
 * Dentist: full access (edit, complete, cancel).
 * Receptionist: create + update only.
 */
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

  // Form state
  const [dueDate, setDueDate] = useState(initialData?.due_date ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Status for existing follow-up
  const currentStatus = initialData?.status ?? null;
  const isPending_ = currentStatus === "pending";
  const isDentist = role === "dentist";

  // Confirm dialog state
  const [confirmAction, setConfirmAction] = useState<"complete" | "cancel" | null>(null);
  const [isActioning, startActionTransition] = useTransition();

  // Sync initial data if it changes (e.g., navigating between follow-ups)
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

    if (!dueDate) {
      setFormError("Due date is required.");
      return;
    }

    const input = {
      patient_id: patientId ?? initialData?.patient_id ?? "",
      appointment_id: appointmentId ?? initialData?.appointment_id ?? undefined,
      treatment_id: treatmentId ?? initialData?.treatment_id ?? undefined,
      due_date: dueDate,
      notes: notes.trim() || undefined,
    };

    startTransition(async () => {
      let result;
      if (followUpId) {
        result = await updateFollowUp(followUpId, input);
      } else {
        result = await createFollowUp(input);
      }

      if (result.error) {
        setFormError(result.error);
        return;
      }

      setFormSuccess(followUpId ? "Follow-up updated." : "Follow-up created.");

      if (!followUpId && result.data) {
        // Redirect to the new follow-up's detail page
        router.push(`/dentist/follow-ups/${result.data.id}`);
        return;
      }

      onSuccess?.();
    });
  }

  function handleStatusAction(action: "complete" | "cancel") {
    setConfirmAction(action);
  }

  function handleConfirm() {
    if (!followUpId || !confirmAction) return;
    setFormError(null);

    startActionTransition(async () => {
      const result =
        confirmAction === "complete"
          ? await completeFollowUp(followUpId)
          : await cancelFollowUp(followUpId);

      setConfirmAction(null);

      if (result.error) {
        setFormError(result.error);
        return;
      }

      // Refresh the page to reflect new status
      router.refresh();
    });
  }

  // Determine if form is editable
  const isEditable = !currentStatus || currentStatus === "pending";
  const isReadOnly = !isEditable || isPending;

  return (
    <>
      <div className="bg-white border rounded-lg p-6 space-y-6 max-w-xl">
        {/* Header with status badge (edit mode only) */}
        {currentStatus && (
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-lg">Follow-Up Details</h2>
            <StatusBadge
              label={FOLLOW_UP_STATUS_LABELS[currentStatus]}
              variant={
                currentStatus === "completed"
                  ? "success"
                  : currentStatus === "cancelled"
                    ? "error"
                    : "default"
              }
            />
          </div>
        )}

        {/* Patient name display (when editing) */}
        {initialData?.patient && (
          <p className="text-sm text-gray-500">
            Patient:{" "}
            <a
              href={`/dentist/patients/${initialData.patient.id}`}
              className="text-blue-600 hover:underline font-medium"
            >
              {initialData.patient.name}
            </a>
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Due date */}
          <div>
            <label htmlFor="due_date" className="block text-sm font-medium text-gray-700 mb-1">
              Due Date <span className="text-red-500">*</span>
            </label>
            <input
              id="due_date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={isReadOnly}
              required
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isReadOnly}
              placeholder="e.g. Root canal review, crown placement check-up…"
              maxLength={1000}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 resize-none"
            />
          </div>

          {/* Read-only metadata (edit mode) */}
          {followUpId && initialData && (
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
              <div>
                <span className="block font-medium text-gray-600">Created</span>
                {formatDate(initialData.created_at)}
              </div>
              {initialData.updated_at !== initialData.created_at && (
                <div>
                  <span className="block font-medium text-gray-600">Updated</span>
                  {formatDate(initialData.updated_at)}
                </div>
              )}
            </div>
          )}

          {/* Error / success feedback */}
          {formError && (
            <p
              role="alert"
              className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2"
            >
              {formError}
            </p>
          )}
          {formSuccess && (
            <p
              role="status"
              className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2"
            >
              {formSuccess}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-1">
            {isEditable && (
              <button
                type="submit"
                disabled={isReadOnly}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isPending ? "Saving…" : followUpId ? "Save Changes" : "Create Follow-Up"}
              </button>
            )}

            {/* Dentist-only status actions */}
            {isDentist && followUpId && isPending_ && (
              <>
                <button
                  type="button"
                  onClick={() => handleStatusAction("complete")}
                  disabled={isActioning}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  Mark Complete
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusAction("cancel")}
                  disabled={isActioning}
                  className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </form>
      </div>

      {/* Confirmation dialog for status transitions */}
      <ConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction === "complete"
            ? "Mark Follow-Up as Complete?"
            : "Cancel Follow-Up?"
        }
        description={
          confirmAction === "complete"
            ? "This will mark the follow-up as completed. This action cannot be undone."
            : "This will cancel the follow-up. This action cannot be undone."
        }
        confirmLabel={confirmAction === "complete" ? "Mark Complete" : "Cancel Follow-Up"}
        cancelLabel="Go Back"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
        isLoading={isActioning}
      />
    </>
  );
}
