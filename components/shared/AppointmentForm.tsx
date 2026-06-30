"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { createAppointment } from "@/actions/appointments";
import { searchPatients, createPatient } from "@/actions/patients";
import { getAvailableSlots } from "@/actions/availability";
import { queryKeys } from "@/lib/query/keys";
import {
  CreateAppointmentSchema,
  CreatePatientSchema,
  type CreateAppointmentInput,
  type CreatePatientInput,
  type Patient,
} from "@/types";
import { cn, formatTime, APPOINTMENT_SOURCE_LABELS } from "@/lib/utils";
import { TREATMENT_TEMPLATES, getDurationForTreatment } from "@/lib/treatment-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { PatientAvatar } from "./PatientAvatar";
import { LoadingSpinner } from "./LoadingSpinner";
import { CheckCircle2, Search, Plus, Clock } from "lucide-react";

type AppointmentFormValues = {
  patient_id: string;
  scheduled_at: string;
  duration_minutes: number;
  source: CreateAppointmentInput["source"];
  notes?: string;
};

interface AppointmentFormProps {
  successRedirect: string;
  cancelHref: string;
  preselectedPatient?: Pick<Patient, "id" | "name">;
  clinicToday?: string;
}

export function AppointmentForm({
  successRedirect,
  cancelHref,
  preselectedPatient,
  clinicToday,
}: AppointmentFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [patientQuery, setPatientQuery] = useState(preselectedPatient?.name ?? "");
  const [patientResults, setPatientResults] = useState<Pick<Patient, "id" | "name" | "phone">[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Pick<Patient, "id" | "name"> | null>(
    preselectedPatient ?? null
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const [showNewPatient, setShowNewPatient] = useState(false);
  const [newPatientError, setNewPatientError] = useState<string | null>(null);
  const [isSavingPatient, setIsSavingPatient] = useState(false);

  const newPatientForm = useForm<CreatePatientInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(CreatePatientSchema) as any,
    defaultValues: { name: "", phone: "", gender: undefined },
  });

  const today = clinicToday ?? new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedTreatmentType, setSelectedTreatmentType] = useState<string>("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    setError,
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

  function handleTreatmentTypeChange(treatmentType: string) {
    setSelectedTreatmentType(treatmentType);
    if (treatmentType) {
      const defaultDuration = getDurationForTreatment(treatmentType);
      setValue("duration_minutes", defaultDuration, { shouldValidate: true });
      fetchSlots(selectedDate, defaultDuration);
    }
  }

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

  function handlePatientSearch(query: string) {
    setPatientQuery(query);
    setSelectedPatient(null);
    setValue("patient_id", "");

    if (searchTimer) clearTimeout(searchTimer);
    if (query.trim().length < 2) {
      setPatientResults([]);
      setShowDropdown(false);
      return;
    }

    const t = setTimeout(async () => {
      setIsSearching(true);
      const result = await searchPatients(query.trim());
      setPatientResults((result.data ?? []).map((p) => ({ id: p.id, name: p.name, phone: p.phone })));
      setShowDropdown(true);
      setIsSearching(false);
    }, 300);

    setSearchTimer(t);
  }

  function selectPatient(p: Pick<Patient, "id" | "name">) {
    setSelectedPatient(p);
    setValue("patient_id", p.id, { shouldValidate: true });
    setPatientQuery(p.name);
    setPatientResults([]);
    setShowDropdown(false);
    setShowNewPatient(false);
  }

  function selectSlot(slot: string) {
    setSelectedSlot(slot);
    setValue("scheduled_at", slot, { shouldValidate: true });
  }

  async function handleSaveNewPatient(values: CreatePatientInput) {
    setNewPatientError(null);
    setIsSavingPatient(true);
    const result = await createPatient(values);
    setIsSavingPatient(false);
    if (result.error || !result.data) {
      setNewPatientError(result.error ?? "Failed to create patient.");
      return;
    }
    selectPatient({ id: result.data.id, name: result.data.name });
    newPatientForm.reset();
    // A new patient was created inline — refresh the patients cache.
    queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
  }

  async function onSubmit(values: AppointmentFormValues) {
    const result = await createAppointment(values);
    if (result.error) {
      setError("root", { message: result.error });
      return;
    }
    // Refresh the appointments cache so the new booking appears.
    queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
    router.push(successRedirect);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, () => {
      // Scroll to first invalid field
      const first = document.querySelector("[aria-invalid='true'], [data-invalid='true']");
      if (first) {
        first.scrollIntoView({ behavior: "smooth", block: "center" });
        (first as HTMLElement).focus?.();
      }
    })} noValidate>
      {errors.root && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs text-[#DC2626]"
        >
          {errors.root.message}
        </div>
      )}

      <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden divide-y divide-[#F4F4F5]">

        {/* ── Patient ─────────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#09090B]">Patient</h3>
              <p className="text-xs text-[#71717A] mt-0.5">Search for existing or add new</p>
            </div>
            {!preselectedPatient && !selectedPatient && (
              <button
                type="button"
                onClick={() => {
                  setShowNewPatient((v) => !v);
                  setPatientResults([]);
                  setPatientQuery("");
                  setValue("patient_id", "");
                  newPatientForm.reset();
                  setNewPatientError(null);
                  setShowDropdown(false);
                }}
                disabled={isSubmitting}
                className="flex items-center gap-1 text-xs font-medium text-[#71717A] hover:text-[#09090B] transition-colors"
              >
                <Plus className="h-3 w-3" aria-hidden />
                {showNewPatient ? "Search existing" : "New patient"}
              </button>
            )}
            {selectedPatient && !preselectedPatient && (
              <button
                type="button"
                onClick={() => {
                  setSelectedPatient(null);
                  setValue("patient_id", "");
                  setPatientQuery("");
                }}
                disabled={isSubmitting}
                className="text-xs text-[#71717A] hover:text-[#09090B] transition-colors"
              >
                Change
              </button>
            )}
          </div>

          <input type="hidden" {...register("patient_id")} />

          {preselectedPatient ? (
            <div className="flex items-center gap-3 px-3 py-2.5 bg-[#F4F4F5] border border-[#E4E4E7] rounded-lg">
              <PatientAvatar name={preselectedPatient.name} size="sm" />
              <span className="text-sm font-medium text-[#09090B]">{preselectedPatient.name}</span>
              <span className="text-xs text-[#A1A1AA]">Pre-selected</span>
            </div>
          ) : selectedPatient ? (
            <div className="flex items-center gap-3 px-3 py-2.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0" aria-hidden />
              <PatientAvatar name={selectedPatient.name} size="sm" />
              <span className="text-sm font-medium text-[#09090B]">{selectedPatient.name}</span>
            </div>
          ) : showNewPatient ? (
            <div className="space-y-3 border border-dashed border-[#E4E4E7] rounded-lg p-4 bg-[#FAFAFA]">
              <p className="text-xs font-semibold text-[#09090B]">New Patient Details</p>

              {newPatientError && (
                <p className="text-xs text-[#DC2626]" role="alert">{newPatientError}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Full Name" htmlFor="np-name" required>
                  <Input
                    id="np-name"
                    type="text"
                    {...newPatientForm.register("name")}
                    disabled={isSavingPatient}
                    placeholder="Patient full name"
                    hasError={!!newPatientForm.formState.errors.name}
                  />
                  {newPatientForm.formState.errors.name && (
                    <p className="text-xs text-[#DC2626] mt-1">{newPatientForm.formState.errors.name.message}</p>
                  )}
                </Field>

                <Field label="Phone" htmlFor="np-phone">
                  <Input
                    id="np-phone"
                    type="tel"
                    {...newPatientForm.register("phone")}
                    disabled={isSavingPatient}
                    placeholder="+91 98765 43210"
                  />
                </Field>

                <Field label="Gender" htmlFor="np-gender">
                  <Select
                    id="np-gender"
                    {...newPatientForm.register("gender")}
                    disabled={isSavingPatient}
                  >
                    <option value="">Select…</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>

                <Field label="Date of Birth" htmlFor="np-dob">
                  <CalendarPicker
                    id="np-dob"
                    value={newPatientForm.watch("date_of_birth") ?? undefined}
                    disabled={isSavingPatient}
                    onChange={(d) => newPatientForm.setValue("date_of_birth", d)}
                    placeholder="Date of birth"
                    clearable
                  />
                </Field>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => { setShowNewPatient(false); newPatientForm.reset(); }}
                  disabled={isSavingPatient}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={newPatientForm.handleSubmit(handleSaveNewPatient)}
                  isLoading={isSavingPatient}
                >
                  {isSavingPatient ? "Saving…" : "Save & Continue"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#A1A1AA]" aria-hidden />
                <Input
                  type="search"
                  value={patientQuery}
                  onChange={(e) => handlePatientSearch(e.target.value)}
                  placeholder="Search patient by name or phone…"
                  disabled={isSubmitting}
                  aria-label="Search patient"
                  autoComplete="off"
                  className="pl-9"
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  onFocus={() => patientResults.length > 0 && setShowDropdown(true)}
                />
                {isSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <LoadingSpinner size="sm" />
                  </div>
                )}
              </div>
              {showDropdown && patientResults.length > 0 && (
                <ul className="absolute z-20 w-full mt-1 bg-white border border-[#E4E4E7] rounded-xl shadow-lg max-h-52 overflow-y-auto">
                  {patientResults.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectPatient(p)}
                        className="w-full px-4 py-2.5 text-left hover:bg-[#FAFAFA] flex items-center gap-3 transition-colors"
                      >
                        <PatientAvatar name={p.name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#09090B] truncate">{p.name}</p>
                          <p className="text-xs text-[#71717A]">{p.phone ?? "—"}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {errors.patient_id && !showNewPatient && (
            <p className="text-xs text-[#DC2626]" role="alert">
              {errors.patient_id.message ?? "Please select a patient."}
            </p>
          )}
        </div>

        {/* ── Date & Time ─────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#09090B]">Date &amp; Time</h3>
            <p className="text-xs text-[#71717A] mt-0.5">Choose an available slot</p>
          </div>

          <input type="hidden" {...register("scheduled_at")} />

          <Field label="Date" htmlFor="appt-date" required>
            <CalendarPicker
              id="appt-date"
              value={selectedDate}
              min={today}
              disabled={isSubmitting}
              onChange={(d) => { if (d) setSelectedDate(d); }}
            />
          </Field>

          {/* Slot grid */}
          {slotsLoading ? (
            <div className="flex items-center gap-2 text-sm text-[#71717A] py-2">
              <LoadingSpinner size="sm" />
              Loading available slots…
            </div>
          ) : slots.length === 0 ? (
            <div className="rounded-lg bg-[#FAFAFA] border border-[#E4E4E7] p-4 text-center">
              <p className="text-sm text-[#71717A]">No available slots on this date.</p>
              <p className="text-xs text-[#A1A1AA] mt-0.5">Try selecting a different date.</p>
            </div>
          ) : (
            <Field label="Available Times" required error={errors.scheduled_at ? "Please select a time slot." : undefined}>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1">
                {slots.map((slot) => {
                  const timePart = slot.split("T")[1]?.slice(0, 5) ?? "";
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => selectSlot(slot)}
                      className={cn(
                        "flex items-center justify-center gap-1 py-2 px-1 text-xs rounded-lg border transition-all",
                        selectedSlot === slot
                          ? "border-[#18181B] bg-[#18181B] text-white font-medium"
                          : "border-[#E4E4E7] text-[#09090B] hover:border-[#D4D4D8] hover:bg-[#FAFAFA]",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      <Clock className="h-3 w-3 opacity-60" aria-hidden />
                      {formatTime(`${timePart}:00`)}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
        </div>

        {/* ── Appointment Details ──────────────────────────────────── */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#09090B]">Details</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Treatment Type" htmlFor="treatment-type" hint="Auto-fills duration">
              <Select
                id="treatment-type"
                value={selectedTreatmentType}
                disabled={isSubmitting}
                onChange={(e) => handleTreatmentTypeChange(e.target.value)}
              >
                <option value="">Select treatment…</option>
                {TREATMENT_TEMPLATES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} ({t.defaultDurationMinutes}m)
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Booking Source" htmlFor="source" required error={errors.source?.message}>
              <Select
                id="source"
                {...register("source")}
                disabled={isSubmitting}
                hasError={!!errors.source}
              >
                {Object.entries(APPOINTMENT_SOURCE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Duration" htmlFor="duration" hint="Changing duration refreshes available slots">
            <Select
              id="duration"
              {...register("duration_minutes", { valueAsNumber: true })}
              disabled={isSubmitting}
              onChange={(e) => {
                const newDuration = Number(e.target.value);
                setValue("duration_minutes", newDuration);
                fetchSlots(selectedDate, newDuration);
                setSelectedSlot(null);
              }}
              className="w-40"
            >
              {[10, 15, 20, 30, 45, 60, 90, 120].map((d) => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </Select>
          </Field>

          <Field label="Notes" htmlFor="notes" hint="Optional — reason for visit, special instructions">
            <Textarea
              id="notes"
              {...register("notes")}
              rows={2}
              disabled={isSubmitting}
              placeholder="Reason for visit, special instructions…"
            />
          </Field>
        </div>

        {/* ── Actions ─────────────────────────────────────────────── */}
        <div className="px-6 py-4 bg-[#FAFAFA] flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" asChild>
            <a href={cancelHref}>Cancel</a>
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting || (!selectedPatient && !preselectedPatient) || !selectedSlot}
            isLoading={isSubmitting}
          >
            {isSubmitting ? "Booking…" : "Book Appointment"}
          </Button>
        </div>
      </div>
    </form>
  );
}
