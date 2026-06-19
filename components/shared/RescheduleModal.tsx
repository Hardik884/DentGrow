"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { rescheduleAppointment } from "@/actions/appointments";
import { getAvailableSlots } from "@/actions/availability";
import { cn, formatTime } from "@/lib/utils";

interface RescheduleModalProps {
  appointmentId: string;
  currentScheduledAt: string;
  onClose: () => void;
}

/**
 * RescheduleModal
 *
 * Date + slot picker modal for rescheduling an appointment.
 * Calls: actions/appointments.ts → rescheduleAppointment()
 * Writes appointment_history row (action: 'rescheduled') server-side.
 */
export function RescheduleModal({
  appointmentId,
  currentScheduledAt,
  onClose,
}: RescheduleModalProps) {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];
  const currentDate = currentScheduledAt.split("T")[0];

  const [selectedDate, setSelectedDate] = useState(
    currentDate >= today ? currentDate : today
  );
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSlots = useCallback(async (date: string) => {
    setSlotsLoading(true);
    setSelectedSlot(null);
    const result = await getAvailableSlots(date);
    setSlots(result.data ?? []);
    setSlotsLoading(false);
  }, []);

  useEffect(() => {
    fetchSlots(selectedDate);
  }, [selectedDate, fetchSlots]);

  async function handleConfirm() {
    if (!selectedSlot) return;
    setIsSubmitting(true);
    setError(null);

    const result = await rescheduleAppointment({
      appointment_id: appointmentId,
      new_scheduled_at: selectedSlot,
    });

    if (result.error) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reschedule-title"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h2 id="reschedule-title" className="text-lg font-semibold text-gray-900">
          Reschedule Appointment
        </h2>

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-md" role="alert">
            {error}
          </div>
        )}

      {/* Date picker */}
      <div className="space-y-1">
        <label htmlFor="reschedule-date" className="text-sm font-medium text-gray-700">New Date</label>
        <input
          id="reschedule-date"
          type="date"
          value={selectedDate}
          min={today}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 w-full"
        />
      </div>

        {/* Slots */}
        {slotsLoading ? (
          <p className="text-sm text-gray-500">Loading slots…</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-gray-500">No slots available on this date.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Select Time</p>
            <div className="grid grid-cols-3 gap-2 max-h-44 overflow-y-auto">
              {slots.map((slot) => {
                const timePart = slot.split("T")[1]?.slice(0, 5) ?? "";
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={cn(
                      "py-2 text-sm rounded-md border transition-colors",
                      selectedSlot === slot
                        ? "border-blue-600 bg-blue-600 text-white font-semibold"
                        : "border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50"
                    )}
                  >
                    {formatTime(`${timePart}:00`)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedSlot || isSubmitting}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Rescheduling…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
