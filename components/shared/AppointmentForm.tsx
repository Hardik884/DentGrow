"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createAppointment } from "@/actions/appointments";
import { searchPatients } from "@/actions/patients";
import { getAvailableSlots } from "@/actions/availability";
import {
  CreateAppointmentSchema,
  type CreateAppointmentInput,
  type Patient,
} from "@/types";
import { cn, formatTime, APPOINTMENT_SOURCE_LABELS } from "@/lib/utils";
import {
  TREATMENT_TEMPLATES,
  getDurationForTreatment,
} from "@/lib/treatment-templates";

// The Zod schema uses .default(30) on duration_minutes which makes the
// input type differ from the output type. We use the output type for the form.
type AppointmentFormValues = {
  patient_id: string;
  scheduled_at: string;
  duration_minutes: number;
  source: CreateAppointmentInput["source"];
  notes?: string;
};

interface AppointmentFormProps {
  /** Where to redirect after successful submit */
  successRedirect: string;
  cancelHref: string;
  /** Pre-selected patient (e.g. when creating from patient profile) */
  preselectedPatient?: Pick<Patient, "id" | "name">;
}

/**
 * AppointmentForm
 *
 * Shared create form for both dentist and receptionist appointment booking.
 *
 * Steps:
 * 1. Patient search + selection (debounced ilike search)
 * 2. Date selection → fetches available slots via getAvailableSlots()
 * 3. Slot selection from the generated grid
 * 4. Source + notes
 *
 * Submits to: actions/appointments.ts → createAppointment()
 */
export function AppointmentForm({
  successRedirect,
  cancelHref,
  preselectedPatient,
}: AppointmentFormProps) {
  const router = useRouter();

  // ── Patient search state ──────────────────────────────────────────────────
  const [patientQuery, setPatientQuery] = useState(
    preselectedPatient?.name ?? ""
  );
  const [patientResults, setPatientResults] = useState<
    Pick<Patient, "id" | "name" | "phone">[]
  >([]);
  const [selectedPatient, setSelectedPatient] = useState<
    Pick<Patient, "id" | "name"> | null
  >(preselectedPatient ?? null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTimer, setSearchTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  // ── Slot state ────────────────────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // ── Treatment type state ──────────────────────────────────────────────────
  const [selectedTreatmentType, setSelectedTreatmentType] = useState<string>("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    setError,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<AppointmentFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(CreateAppointmentSchema) as any,
    defaultValues: {
      source: "phone_call",
      duration_minutes: 30,
      patient_id: preselectedPatient?.id ?? "",
      scheduled_at: "",
    },
  });

  // ── Treatment type → auto-fill duration ───────────────────────────────────
  function handleTreatmentTypeChange(treatmentType: string) {
    setSelectedTreatmentType(treatmentType);
    if (treatmentType) {
      const defaultDuration = getDurationForTreatment(treatmentType);
      setValue("duration_minutes", defaultDuration, { shouldValidate: true });
      // Re-fetch slots for new duration
      fetchSlots(selectedDate, defaultDuration);
    }
  }

  // ── Fetch available slots when date OR duration changes ──────────────────
  const fetchSlots = useCallback(async (date: string, durationMinutes: number) => {
    setSlotsLoading(true);
    setSelectedSlot(null);
    setValue("scheduled_at", "");
    const result = await getAvailableSlots(date, durationMinutes);
    setSlots(result.data ?? []);
    setSlotsLoading(false);
  }, [setValue]);

  useEffect(() => {
    const duration = watch("duration_minutes") ?? 30;
    fetchSlots(selectedDate, duration);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, fetchSlots]);

  // ── Patient search debounce ───────────────────────────────────────────────
  function handlePatientSearch(query: string) {
    setPatientQuery(query);
    setSelectedPatient(null);
    setValue("patient_id", "");

    if (searchTimer) clearTimeout(searchTimer);
    if (query.trim().length < 2) {
      setPatientResults([]);
      return;
    }

    const t = setTimeout(async () => {
      setIsSearching(true);
      const result = await searchPatients(query.trim());
      setPatientResults(
        (result.data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          phone: p.phone,
        }))
      );
      setIsSearching(false);
    }, 300);

    setSearchTimer(t);
  }

  function selectPatient(p: Pick<Patient, "id" | "name">) {
    setSelectedPatient(p);
    setValue("patient_id", p.id, { shouldValidate: true });
    setPatientQuery(p.name);
    setPatientResults([]);
  }

  function selectSlot(slot: string) {
    setSelectedSlot(slot);
    setValue("scheduled_at", slot, { shouldValidate: true });
  }

  async function onSubmit(values: AppointmentFormValues) {
    const result = await createAppointment(values);
    if (result.error) {
      setError("root", { message: result.error });
      return;
    }
    router.push(successRedirect);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white border rounded-lg divide-y"
      noValidate
    >
      {/* Root error */}
      {errors.root && (
        <div
          role="alert"
          className="px-6 py-4 bg-red-50 border-b border-red-200 text-sm text-red-700 rounded-t-lg"
        >
          {errors.root.message}
        </div>
      )}

      {/* ── Patient ─────────────────────────────────────────────── */}
      <fieldset className="px-6 py-5 space-y-3">
        <legend className="text-sm font-semibold text-gray-900">Patient</legend>

        <input type="hidden" {...register("patient_id")} />

        {preselectedPatient ? (
          <div className="flex items-center gap-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md">
            <span className="text-sm font-medium text-blue-800">
              {preselectedPatient.name}
            </span>
            <span className="text-xs text-blue-500">Pre-selected</span>
          </div>
        ) : (
          <div className="relative">
            <input
              type="search"
              value={patientQuery}
              onChange={(e) => handlePatientSearch(e.target.value)}
              placeholder="Search patient by name or phone…"
              disabled={isSubmitting}
              className={cn(
                "w-full px-3 py-2 text-sm border rounded-md outline-none",
                "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
                "disabled:bg-gray-50 disabled:cursor-not-allowed",
                selectedPatient ? "border-green-400 bg-green-50" : "border-gray-300"
              )}
              aria-label="Search patient"
              autoComplete="off"
            />
            {isSearching && (
              <span className="absolute right-3 top-2.5 text-xs text-gray-400">
                Searching…
              </span>
            )}
            {patientResults.length > 0 && (
              <ul className="absolute z-20 w-full mt-1 bg-white border rounded-md shadow-lg max-h-52 overflow-y-auto">
                {patientResults.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => selectPatient(p)}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex justify-between items-center"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-gray-400 text-xs">{p.phone ?? "—"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {selectedPatient && !preselectedPatient && (
          <p className="text-xs text-green-600">✓ {selectedPatient.name} selected</p>
        )}
        {errors.patient_id && (
          <p className="text-xs text-red-600" role="alert">
            {errors.patient_id.message}
          </p>
        )}
      </fieldset>

      {/* ── Date + Slot ─────────────────────────────────────────── */}
      <fieldset className="px-6 py-5 space-y-4">
        <legend className="text-sm font-semibold text-gray-900">
          Date &amp; Time
        </legend>

        <input type="hidden" {...register("scheduled_at")} />

        {/* Date picker */}
        <div className="space-y-1">
          <label htmlFor="appt-date" className="block text-sm font-medium text-gray-700">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            id="appt-date"
            type="date"
            value={selectedDate}
            min={today}
            disabled={isSubmitting}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
          />
        </div>

        {/* Slot grid */}
        {slotsLoading ? (
          <p className="text-sm text-gray-500">Loading available slots…</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-gray-500">
            No available slots on {selectedDate}. Try a different date.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">
              Available Times <span className="text-red-500">*</span>
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {slots.map((slot) => {
                const timePart = slot.split("T")[1]?.slice(0, 5) ?? "";
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => selectSlot(slot)}
                    className={cn(
                      "py-2 px-1 text-sm rounded-md border transition-colors",
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
        )}

        {errors.scheduled_at && (
          <p className="text-xs text-red-600" role="alert">
            Please select a time slot.
          </p>
        )}
      </fieldset>

      {/* ── Appointment Details ──────────────────────────────────── */}
      <fieldset className="px-6 py-5 space-y-4">
        <legend className="text-sm font-semibold text-gray-900">Details</legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Treatment Type — auto-fills duration */}
          <div className="space-y-1">
            <label
              htmlFor="treatment-type"
              className="block text-sm font-medium text-gray-700"
            >
              Treatment Type{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              id="treatment-type"
              value={selectedTreatmentType}
              disabled={isSubmitting}
              onChange={(e) => handleTreatmentTypeChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
            >
              <option value="">Select treatment…</option>
              {TREATMENT_TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label} ({t.defaultDurationMinutes} min)
                </option>
              ))}
            </select>
            {selectedTreatmentType && (
              <p className="text-xs text-blue-600">
                Duration auto-set — you can override below
              </p>
            )}
          </div>

          {/* Source */}
          <div className="space-y-1">
            <label
              htmlFor="source"
              className="block text-sm font-medium text-gray-700"
            >
              Booking Source <span className="text-red-500">*</span>
            </label>
            <select
              id="source"
              {...register("source")}
              disabled={isSubmitting}
              className={cn(
                "w-full px-3 py-2 text-sm border rounded-md outline-none",
                "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
                "disabled:bg-gray-50 disabled:cursor-not-allowed",
                errors.source ? "border-red-400" : "border-gray-300"
              )}
            >
              {Object.entries(APPOINTMENT_SOURCE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
            {errors.source && (
              <p className="text-xs text-red-600" role="alert">
                {errors.source.message}
              </p>
            )}
          </div>
        </div>

        {/* Duration — pre-filled from treatment type, manually overrideable */}
        <div className="space-y-1">
          <label
            htmlFor="duration"
            className="block text-sm font-medium text-gray-700"
          >
            Duration (minutes)
          </label>
          <div className="flex items-center gap-3">
            <select
              id="duration"
              {...register("duration_minutes", { valueAsNumber: true })}
              disabled={isSubmitting}
              onChange={(e) => {
                const newDuration = Number(e.target.value);
                setValue("duration_minutes", newDuration);
                // Re-fetch slots for the new duration
                fetchSlots(selectedDate, newDuration);
                setSelectedSlot(null);
              }}
              className="w-48 px-3 py-2 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
            >
              {[10, 15, 20, 30, 45, 60, 90, 120].map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500">
              Changing duration refreshes available slots
            </span>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-gray-700"
          >
            Notes{" "}
            <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="notes"
            {...register("notes")}
            rows={2}
            disabled={isSubmitting}
            placeholder="Reason for visit, special instructions…"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md outline-none resize-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
          />
          {errors.notes && (
            <p className="text-xs text-red-600" role="alert">
              {errors.notes.message}
            </p>
          )}
        </div>
      </fieldset>

      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="px-6 py-4 bg-gray-50 flex items-center justify-end gap-3 rounded-b-lg">
        <a
          href={cancelHref}
          className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={isSubmitting || !selectedPatient || !selectedSlot}
          className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md
                     hover:bg-blue-700 transition-colors
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2
                     disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Booking…" : "Book Appointment"}
        </button>
      </div>
    </form>
  );
}
