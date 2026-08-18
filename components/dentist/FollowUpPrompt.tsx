"use client";

import { CalendarPlus } from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface FollowUpPromptProps {
  open: boolean;
  /** Dismiss without scheduling. */
  onDismiss: () => void;
  /** Proceed to the follow-up form. */
  onAccept: () => void;
  patientName?: string;
}

/**
 * A nudge, not a gate.
 *
 * Clinics forget to book recalls, and a forgotten recall is the quietest way a
 * practice loses a patient. The cheapest moment to catch it is the second after
 * treatment is recorded, while the clinician still has the case in mind.
 *
 * Three deliberate constraints, because a prompt that annoys people gets
 * click-through-dismissed within a week and then it is worse than nothing:
 *
 *   - It appears ONLY after a treatment saves successfully. Never on page load,
 *     never on cancel, never on a failed save.
 *   - "Not now" is a real answer. Nothing is blocked, nothing is remembered as
 *     an outstanding task, and the treatment is already saved either way.
 *   - It asks one question and offers two buttons. No form, no fields, no
 *     reading.
 */
export function FollowUpPrompt({
  open,
  onDismiss,
  onAccept,
  patientName,
}: FollowUpPromptProps) {
  return (
    <Dialog open={open} onClose={onDismiss} title="" size="sm">
      <div className="p-6 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted">
          <CalendarPlus className="h-5 w-5 text-text-secondary" aria-hidden />
        </div>

        <h2 className="mt-4 text-base font-semibold text-text-primary">
          Schedule a follow-up?
        </h2>
        <p className="mt-1.5 text-sm text-text-secondary">
          {patientName
            ? `The treatment is saved. Would you like to book ${patientName}'s next visit now?`
            : "The treatment is saved. Would you like to book the next visit now?"}
        </p>

        <div className="mt-5 flex items-center justify-center gap-2">
          {/* Dismiss sits first and reads plainly: the honest default is that
              most visits do not need a recall, and the prompt should not push. */}
          <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
            Not now
          </Button>
          <Button type="button" size="sm" onClick={onAccept}>
            Create follow-up
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
