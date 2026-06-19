"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getAvailableSlots } from "@/actions/availability";
import { createAppointment } from "@/actions/appointments";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface SlotPickerProps {
  /** Pre-resolved patient_id for the portal user */
  patientId: string;
}

/**
 * SlotPicker
 *
 * Patient portal slot selection + booking UI.
 *
 * Flow:
 * 1. Patient picks a date → getAvailableSlots(date) fetches real slots.
 * 2. Patient selects a slot.
 * 3. Confirm → calls createAppointment() server action (source: 'website').
 * 4. On success → redirects to /portal/appointments.
 */
export function SlotPicker({ patientId }: SlotPickerProps) {
  const router = useRouter();

  // We cannot know the clinic timezone client-side without an extra fetch.
  // Use UTC-based today as the minimum — the server action also validates
  // that the date is not in the past, so this is a UI-only guard.
  // The getAvailableSlots server action filters past slots server-side using
  // the clinic timezone, so this only affects the date picker minimum.
  const today = new Date().toISOString().split("T")[0];

  const [selectedDate, setSelectedDate] = useState(today);
  const [slots, setSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotsLoaded, setSlotsLoaded] = useState(false);

  const fetchSlots = useCallback(async (date: string) => {
    setIsLoadingSlots(true);
    setSelectedSlot(null);
    setError(null);
    const result = await getAvailableSlots(date);
    setSlots(result.data ?? []);
    setIsLoadingSlots(false);
    setSlotsLoaded(true);
  }, []);

  async function handleDateChange(date: string) {
    setSelectedDate(date);
    await fetchSlots(date);
  }

  async function handleConfirm() {
    if (!selectedSlot) return;
    setIsBooking(true);
    setError(null);

    const result = await createAppointment({
      patient_id: patientId,
      scheduled_at: selectedSlot,
      source: "website",
      duration_minutes: 30,
    });

    if (result.error) {
      setError(result.error);
      setIsBooking(false);
      return;
    }

    router.push("/portal/appointments");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Error */}
      {error && (
        <div
          role="alert"
          className="px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-md"
        >
          {error}
        </div>
      )}

      {/* Date picker */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700 block">
          Select Date
        </label>
            {/* Date picker */}
          <input
            type="date"
            id="slot-date"
            value={selectedDate}
            min={today}
            disabled={isBooking}
            onChange={(e) => handleDateChange(e.target.value)}
            aria-label="Select appointment date"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
          />
        {!slotsLoaded && (
          <button
            type="button"
            onClick={() => fetchSlots(selectedDate)}
            className="text-sm text-blue-600 hover:underline mt-1"
          >
            Check available slots →
          </button>
        )}
      </div>

      {/* Slot grid */}
      {isLoadingSlots ? (
        <p className="text-sm text-gray-500">Loading available slots…</p>
      ) : slotsLoaded && slots.length === 0 ? (
        <p className="text-sm text-gray-500">
          No available slots on this date. Please try another day.
        </p>
      ) : slotsLoaded ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Select Time</p>
          <div className="grid grid-cols-3 gap-2">
            {slots.map((slot) => {
              const timePart = slot.split("T")[1]?.slice(0, 5) ?? "";
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={isBooking}
                  onClick={() => setSelectedSlot(slot)}
                  className={cn(
                    "py-2 text-sm rounded-lg border transition-colors",
                    selectedSlot === slot
                      ? "border-blue-600 bg-blue-600 text-white font-semibold"
                      : "border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {formatTime(`${timePart}:00`)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Confirm */}
      {selectedSlot && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Selected:{" "}
            <strong>
              {selectedDate} at{" "}
              {formatTime(`${selectedSlot.split("T")[1]?.slice(0, 5)}:00`)}
            </strong>
          </p>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isBooking}
            className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {isBooking ? "Booking…" : "Confirm Appointment"}
          </button>
        </div>
      )}
    </div>
  );
}
