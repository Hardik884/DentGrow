"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { rescheduleAppointment } from "@/actions/appointments";
import { getAvailableSlots } from "@/actions/availability";
import { queryKeys } from "@/lib/query/keys";
import { cn, formatTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { LoadingSpinner } from "./LoadingSpinner";
import { Clock } from "lucide-react";

interface RescheduleModalProps {
  appointmentId: string;
  currentScheduledAt: string;
  onClose: () => void;
  clinicToday?: string;
}

export function RescheduleModal({
  appointmentId,
  currentScheduledAt,
  onClose,
  clinicToday,
}: RescheduleModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const today = clinicToday ?? new Date().toISOString().split("T")[0];
  // Reschedule is a staff-only flow. Any historical date is allowed so past
  // visits can be corrected or migrated. Slot rules (DOW, clinic hours,
  // conflict) still apply server-side.
  const currentDate = currentScheduledAt.slice(0, 10);

  const [selectedDate, setSelectedDate] = useState(currentDate || today);
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
    const result = await rescheduleAppointment({ appointment_id: appointmentId, new_scheduled_at: selectedSlot });
    if (result.error) { setError(result.error); setIsSubmitting(false); return; }
    queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
    router.refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reschedule-title"
    >
      <div className="absolute inset-0 bg-[#0B0F0E]/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-xl border border-[#E3E9E6] shadow-2xl w-full max-w-md p-6 space-y-5 animate-fade-in-up">
        <h2 id="reschedule-title" className="text-base font-semibold text-[#151918]">
          Reschedule Appointment
        </h2>

        {error && (
          <div className="rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs text-[#DC2626]" role="alert">
            {error}
          </div>
        )}

        <Field label="New Date" htmlFor="reschedule-date">
          <CalendarPicker
            id="reschedule-date"
            value={selectedDate}
            onChange={(d) => { if (d) setSelectedDate(d); }}
          />
        </Field>

        {slotsLoading ? (
          <div className="flex items-center gap-2 text-sm text-[#737A76]">
            <LoadingSpinner size="sm" />
            Loading slots…
          </div>
        ) : slots.length === 0 ? (
          <div className="rounded-lg bg-[#F6F8F6] border border-[#E3E9E6] p-4 text-center">
            <p className="text-sm text-[#737A76]">No slots available on this date.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-[#151918]">Select Time</p>
            <div className="grid grid-cols-3 gap-2 max-h-44 overflow-y-auto">
              {slots.map((slot) => {
                const timePart = slot.split("T")[1]?.slice(0, 5) ?? "";
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={cn(
                      "flex items-center justify-center gap-1 py-2 text-xs rounded-lg border transition-all",
                      selectedSlot === slot
                        ? "border-[#0D6B5E] bg-[#0D6B5E] text-white font-medium"
                        : "border-[#E3E9E6] text-[#151918] hover:border-[#CBD5D0] hover:bg-[#F6F8F6]"
                    )}
                  >
                    <Clock className="h-3 w-3 opacity-60" aria-hidden />
                    {formatTime(`${timePart}:00`)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!selectedSlot || isSubmitting}
            isLoading={isSubmitting}
          >
            {isSubmitting ? "Rescheduling…" : "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}
