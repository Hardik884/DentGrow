"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAppointmentNotes } from "@/actions/appointments";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Pencil, Check, X } from "lucide-react";

interface AppointmentNotesEditorProps {
  appointmentId: string;
  initialNotes: string | null;
}

/**
 * AppointmentNotesEditor
 *
 * Client component — inline editor for appointment-level notes on the
 * appointment detail page. Notes can be edited at ANY time, independent of the
 * appointment lifecycle. Saving touches only the `notes` field via the
 * updateAppointmentNotes server action — no other appointment data changes.
 */
export function AppointmentNotesEditor({
  appointmentId,
  initialNotes,
}: AppointmentNotesEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialNotes ?? "");
  const [error, setError] = useState<string | null>(null);

  const savedNotes = initialNotes ?? "";

  function startEdit() {
    setValue(savedNotes);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setValue(savedNotes);
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateAppointmentNotes(appointmentId, value);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="pt-4 border-t">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Appointment Notes
        </p>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            <Pencil className="h-3 w-3" aria-hidden />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Add appointment notes…"
            maxLength={1000}
            disabled={isPending}
            autoFocus
          />
          {error && (
            <p className="text-xs text-red-600" role="alert">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} isLoading={isPending} disabled={isPending}>
              <Check className="h-3.5 w-3.5" aria-hidden />
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={cancel}
              disabled={isPending}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-700 whitespace-pre-wrap">
          {savedNotes ? savedNotes : <span className="text-gray-400">No notes</span>}
        </p>
      )}
    </div>
  );
}
