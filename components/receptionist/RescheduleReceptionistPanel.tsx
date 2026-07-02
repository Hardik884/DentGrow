"use client";

import { useState } from "react";
import { RescheduleModal } from "@/components/shared/RescheduleModal";
import { Button } from "@/components/ui/button";
import { CalendarClock } from "lucide-react";

interface RescheduleReceptionistPanelProps {
  appointmentId: string;
  currentScheduledAt: string;
  /** Today's date in clinic timezone. Forwarded to RescheduleModal. */
  clinicToday?: string;
  /** Compact mode renders a smaller button for inline use */
  compact?: boolean;
}

/**
 * RescheduleReceptionistPanel
 *
 * Trigger button that opens the RescheduleModal.
 * Used on the receptionist appointment detail page.
 */
export function RescheduleReceptionistPanel({
  appointmentId,
  currentScheduledAt,
  clinicToday,
  compact = false,
}: RescheduleReceptionistPanelProps) {
  const [open, setOpen] = useState(false);

  if (compact) {
    return (
      <>
        <Button
          variant="outline"
          size="xs"
          onClick={() => setOpen(true)}
        >
          <CalendarClock className="h-3 w-3" aria-hidden />
          Reschedule
        </Button>
        {open && (
          <RescheduleModal
            appointmentId={appointmentId}
            currentScheduledAt={currentScheduledAt}
            onClose={() => setOpen(false)}
            clinicToday={clinicToday}
          />
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
      >
        Reschedule
      </button>
      {open && (
        <RescheduleModal
          appointmentId={appointmentId}
          currentScheduledAt={currentScheduledAt}
          onClose={() => setOpen(false)}
          clinicToday={clinicToday}
        />
      )}
    </>
  );
}
