"use client";

import { useState } from "react";
import { RescheduleModal } from "@/components/shared/RescheduleModal";

interface RescheduleReceptionistPanelProps {
  appointmentId: string;
  currentScheduledAt: string;
  /** Today's date in clinic timezone. Forwarded to RescheduleModal. */
  clinicToday?: string;
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
}: RescheduleReceptionistPanelProps) {
  const [open, setOpen] = useState(false);

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
