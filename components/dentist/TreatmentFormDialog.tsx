"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button, type ButtonVariant, type ButtonSize } from "@/components/ui/button";
import { TreatmentForm } from "./TreatmentForm";
import { FollowUpPrompt } from "./FollowUpPrompt";
import { FollowUpForm } from "@/components/follow-ups/FollowUpForm";

interface TreatmentFormDialogProps {
  appointmentId?: string;
  patientId?: string;
  treatmentId?: string;
  /** Dialog title. Defaults to "Treatment". */
  title?: string;
  /** Class names applied to the trigger button. */
  triggerClassName?: string;
  /** When set, the trigger renders via the shared Button for consistent styling. */
  triggerVariant?: ButtonVariant;
  /** Trigger Button size (only used with triggerVariant). Defaults to "sm". */
  triggerSize?: ButtonSize;
  /** Patient name, used only to personalise the follow-up prompt. */
  patientName?: string;
  /**
   * Offer to schedule a follow-up after a treatment is created.
   *
   * Opt-in rather than automatic. This dialog is also used for EDITING, where
   * "you just recorded treatment, book the next visit?" makes no sense — the
   * follow-up for that visit was either booked long ago or deliberately not.
   */
  promptFollowUp?: boolean;
  /** Trigger button content. */
  children: ReactNode;
}

/**
 * TreatmentFormDialog
 *
 * Inline launcher for the shared TreatmentForm. Opens a centered dialog instead
 * of navigating to a separate page. Reuses TreatmentForm and its create/update
 * server actions unchanged; on success it closes and refreshes the current page.
 *
 * When `promptFollowUp` is set, a successful CREATE is followed by a small
 * prompt offering to book the next visit. This dialog is where that belongs: it
 * is the only place that knows a treatment was just saved, as opposed to viewed,
 * edited, or abandoned. Putting the prompt on the page instead would fire it on
 * every visit to the appointment, which is exactly the nagging a clinic learns
 * to click past within a week.
 */
export function TreatmentFormDialog({
  appointmentId,
  patientId,
  treatmentId,
  title = "Treatment",
  triggerClassName,
  triggerVariant,
  triggerSize = "sm",
  patientName,
  promptFollowUp = false,
  children,
}: TreatmentFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);

  // Editing an existing treatment is never a reason to ask about a recall.
  const shouldPrompt = promptFollowUp && !treatmentId;

  function finish() {
    setPromptOpen(false);
    setFollowUpOpen(false);
    router.refresh();
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

      <Dialog open={open} onClose={() => setOpen(false)} title={title} size="xl">
        <div className="p-4">
          <TreatmentForm
            appointmentId={appointmentId}
            patientId={patientId}
            treatmentId={treatmentId}
            onCancel={() => setOpen(false)}
            onSuccess={() => {
              setOpen(false);
              // Refresh regardless, so the saved treatment is on screen behind
              // the prompt rather than appearing only after it is dismissed.
              router.refresh();
              if (shouldPrompt) setPromptOpen(true);
            }}
          />
        </div>
      </Dialog>

      {shouldPrompt && (
        <>
          <FollowUpPrompt
            open={promptOpen}
            patientName={patientName}
            onDismiss={() => setPromptOpen(false)}
            onAccept={() => {
              setPromptOpen(false);
              setFollowUpOpen(true);
            }}
          />

          <Dialog
            open={followUpOpen}
            onClose={() => setFollowUpOpen(false)}
            title="Schedule Follow-up"
            size="xl"
          >
            <div className="p-4">
              {followUpOpen && (
                <FollowUpForm
                  patientId={patientId}
                  patientName={patientName}
                  appointmentId={appointmentId}
                  // Patient and originating visit are already known, so the
                  // clinician only picks a date. Re-asking for what we just came
                  // from is how a two-click flow becomes six.
                  hideRelatedFields
                  onSuccess={finish}
                />
              )}
            </div>
          </Dialog>
        </>
      )}
    </>
  );
}
