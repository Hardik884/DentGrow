"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getAvailableSlots } from "@/actions/availability";
import { createAppointment } from "@/actions/appointments";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { CalendarPicker } from "@/components/ui/calendar-picker";

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
    if (!date) return;
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
  }

  return (
    <div className="space-y-5">
      {/* Error */}
      {error && (
        <div
          role="alert"
          className="px-4 py-3 bg-danger-bg border border-danger-border text-sm text-danger rounded-lg"
        >
          {error}
        </div>
      )}

      {/* Date picker */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-text-secondary block" htmlFor="slot-date">
          Select Date
        </label>
        <CalendarPicker
          id="slot-date"
          value={selectedDate}
          min={today}
          disabled={isBooking}
          onChange={handleDateChange}
          placeholder="Pick an appointment date"
        />
        {!slotsLoaded && (
          <button
            type="button"
            onClick={() => fetchSlots(selectedDate)}
            className="text-sm text-accent hover:underline mt-1 block"
          >
            Check available slots →
          </button>
        )}
      </div>

      {/* Slot grid */}
      {isLoadingSlots ? (
        <p className="text-sm text-text-secondary">Loading available slots…</p>
      ) : slotsLoaded && slots.length === 0 ? (
        <p className="text-sm text-text-secondary">
          No available slots on this date. Please try another day.
        </p>
      ) : slotsLoaded ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-text-secondary">Select Time</p>
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
                      ? "border-accent bg-accent text-accent-foreground font-semibold"
                      : "border-border text-text-secondary hover:border-accent hover:bg-accent-tint",
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
          <p className="text-sm text-text-secondary">
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
            className="w-full py-2.5 bg-accent text-accent-foreground text-sm font-semibold rounded-lg hover:bg-accent-hover disabled:opacity-60 transition-colors"
          >
            {isBooking ? "Booking…" : "Confirm Appointment"}
          </button>
        </div>
      )}
    </div>
  );
}
