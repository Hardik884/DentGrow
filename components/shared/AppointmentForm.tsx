"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { cn, formatTime, calculateAge, APPOINTMENT_SOURCE_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { PatientAvatar } from "./PatientAvatar";
import { LoadingSpinner } from "./LoadingSpinner";
import { CheckCircle2, Search, Clock, UserPlus } from "lucide-react";

type AppointmentFormValues = {
  patient_id: string;
  scheduled_at: string;
  duration_minutes: number;
  source: CreateAppointmentInput["source"];
  chief_complaints?: string;
};

interface AppointmentFormProps {
  /** Where to navigate after a successful booking. Ignored when onSuccess is set. */
  successRedirect?: string;
  /** Cancel link target. Ignored when onCancel is set. */
  cancelHref?: string;
  preselectedPatient?: Pick<Patient, "id" | "name">;
  clinicToday?: string;
  /** When provided, called after a successful booking instead of navigating (modal use). */
  onSuccess?: () => void;
  /** When provided, renders a Cancel button that calls this instead of a link (modal use). */
  onCancel?: () => void;
}

/** True when a query string looks like a phone number rather than a name. */
function looksLikePhone(q: string): boolean {
  return /\d/.test(q) && /^[+\d][\d\s\-()]*$/.test(q.trim());
}

/** Derive an approximate DOB (Jan 1 of the birth year) from an age in years. */
function dobFromAge(age: number): string {
  const year = new Date().getFullYear() - age;
  return `${year}-01-01`;
}

export function AppointmentForm({
  successRedirect,
  cancelHref,
  preselectedPatient,
  clinicToday,
  onSuccess,
  onCancel,
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

  // New-patient mode is entered AUTOMATICALLY when a search yields no match.
  const [newPatientMode, setNewPatientMode] = useState(false);
  const [newPatientError, setNewPatientError] = useState<string | null>(null);
  const [newPatientAge, setNewPatientAge] = useState("");

  const [isBooking, setIsBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const newPatientForm = useForm<CreatePatientInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(CreatePatientSchema) as any,
    defaultValues: { name: "", phone: "", gender: undefined },
  });
  const newPatientName = newPatientForm.watch("name");

  const today = clinicToday ?? new Date().toISOString().split("T")[0];
  // Staff (dentist/receptionist) may pick ANY historical date so migrated /
  // paper records can be entered. Future dates continue to work as before.
  const [selectedDate, setSelectedDate] = useState(today);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const {
    register,
    setValue,
    getValues,
    watch,
    formState: { errors },
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

  function enterNewPatientMode(query: string) {
    const phone = looksLikePhone(query);
    newPatientForm.reset({
      name: phone ? "" : query,
      phone: phone ? query : "",
      gender: undefined,
    });
    setNewPatientAge("");
    setNewPatientError(null);
    setNewPatientMode(true);
  }

  function resetPatientSelection() {
    setSelectedPatient(null);
    setValue("patient_id", "");
    setPatientQuery("");
    setPatientResults([]);
    setShowDropdown(false);
    setNewPatientMode(false);
    setNewPatientError(null);
  }

  function handlePatientSearch(query: string) {
    setPatientQuery(query);
    setSelectedPatient(null);
    setValue("patient_id", "");
    setNewPatientMode(false);

    if (searchTimer) clearTimeout(searchTimer);
    if (query.trim().length < 2) {
      setPatientResults([]);
      setShowDropdown(false);
      return;
    }

    const t = setTimeout(async () => {
      setIsSearching(true);
      const result = await searchPatients(query.trim());
      const results = (result.data ?? []).map((p) => ({ id: p.id, name: p.name, phone: p.phone }));
      setPatientResults(results);
      setShowDropdown(results.length > 0);
      setIsSearching(false);
      // No existing patient matches → switch straight into New Patient mode.
      if (results.length === 0) {
        enterNewPatientMode(query.trim());
      }
    }, 300);

    setSearchTimer(t);
  }

  function selectPatient(p: Pick<Patient, "id" | "name">) {
    setSelectedPatient(p);
    setValue("patient_id", p.id, { shouldValidate: true });
    setPatientQuery(p.name);
    setPatientResults([]);
    setShowDropdown(false);
    setNewPatientMode(false);
  }

  function selectSlot(slot: string) {
    setSelectedSlot(slot);
    setValue("scheduled_at", slot, { shouldValidate: true });
  }

  const hasPatient = !!(selectedPatient || preselectedPatient);
  const canBook =
    !!selectedSlot && (hasPatient || (newPatientMode && (newPatientName?.trim().length ?? 0) >= 2));

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    setBookError(null);
    setNewPatientError(null);

    if (!selectedSlot) {
      setBookError("Please select a time slot.");
      return;
    }

    let patientId = selectedPatient?.id ?? preselectedPatient?.id ?? null;

    setIsBooking(true);

    // ── Create the patient inline when no existing record was selected ──────
    if (!patientId) {
      const valid = await newPatientForm.trigger();
      if (!valid) {
        setIsBooking(false);
        setNewPatientMode(true);
        return;
      }
      const values = newPatientForm.getValues();

      // Age OR DOB: derive an approximate DOB from age when DOB is not given.
      let dateOfBirth = values.date_of_birth || undefined;
      const ageNum = parseInt(newPatientAge, 10);
      if (!dateOfBirth && Number.isFinite(ageNum) && ageNum > 0 && ageNum < 130) {
        dateOfBirth = dobFromAge(ageNum);
      }

      const res = await createPatient({ ...values, date_of_birth: dateOfBirth });
      if (res.error || !res.data) {
        setIsBooking(false);
        setNewPatientError(res.error ?? "Failed to create patient.");
        return;
      }
      patientId = res.data.id;
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
      selectPatient({ id: res.data.id, name: res.data.name });
    }

    // ── Book the appointment ────────────────────────────────────────────────
    const result = await createAppointment({
      patient_id: patientId,
      scheduled_at: getValues("scheduled_at") || selectedSlot,
      duration_minutes: watch("duration_minutes") ?? 30,
      source: getValues("source"),
      chief_complaints: getValues("chief_complaints"),
    });

    setIsBooking(false);

    if (result.error) {
      setBookError(result.error);
      return;
    }

    // ── Success ──────────────────────────────────────────────────────────────
    setSuccess(true);
    toast.success("Appointment booked successfully.");
    queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });

    if (onSuccess) {
      onSuccess();
      return;
    }
    router.push(successRedirect ?? "/dentist/appointments");
  }

  return (
    <form onSubmit={handleBook} noValidate>
      {bookError && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-danger-bg border border-danger-border px-4 py-3 text-xs text-danger"
        >
          {bookError}
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-surface-muted">

        {/* ── Patient ─────────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Patient</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Search by name or phone — new patients are added automatically
              </p>
            </div>
            {(selectedPatient || newPatientMode) && !preselectedPatient && (
              <button
                type="button"
                onClick={resetPatientSelection}
                disabled={isBooking}
                className="text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                Change
              </button>
            )}
          </div>

          <input type="hidden" {...register("patient_id")} />

          {preselectedPatient ? (
            <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-muted border border-border rounded-lg">
              <PatientAvatar name={preselectedPatient.name} size="sm" />
              <span className="text-sm font-medium text-text-primary">{preselectedPatient.name}</span>
              <span className="text-xs text-text-disabled">Pre-selected</span>
            </div>
          ) : selectedPatient ? (
            <div className="flex items-center gap-3 px-3 py-2.5 bg-success-bg border border-success-border rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden />
              <PatientAvatar name={selectedPatient.name} size="sm" />
              <span className="text-sm font-medium text-text-primary">{selectedPatient.name}</span>
            </div>
          ) : (
            <>
              {/* Single entry field: Patient Name / Phone Number */}
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-disabled" aria-hidden />
                  <Input
                    type="search"
                    value={patientQuery}
                    onChange={(e) => handlePatientSearch(e.target.value)}
                    placeholder="Patient name / phone number…"
                    disabled={isBooking}
                    aria-label="Patient name or phone number"
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
                  <ul className="absolute z-20 w-full mt-1 bg-surface border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {patientResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectPatient(p)}
                          className="w-full px-4 py-2.5 text-left hover:bg-background flex items-center gap-3 transition-colors"
                        >
                          <PatientAvatar name={p.name} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">{p.name}</p>
                            <p className="text-xs text-text-secondary">{p.phone ?? "—"}</p>
                          </div>
                        </button>
                      </li>
                    ))}
                    {patientQuery.trim().length >= 2 && (
                      <li className="border-t border-surface-muted">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setShowDropdown(false);
                            enterNewPatientMode(patientQuery.trim());
                          }}
                          className="w-full px-4 py-2.5 text-left hover:bg-background flex items-center gap-2 text-sm text-text-body transition-colors"
                        >
                          <UserPlus className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
                          Add “{patientQuery.trim()}” as new patient
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>

              {/* New patient — revealed automatically when no match is found */}
              {newPatientMode && (
                <div className="space-y-3 border border-dashed border-border rounded-lg p-4 bg-background">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                    <UserPlus className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
                    New Patient — no existing record found
                  </div>

                  {newPatientError && (
                    <p className="text-xs text-danger" role="alert">{newPatientError}</p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Full Name" htmlFor="np-name" required>
                      <Input
                        id="np-name"
                        type="text"
                        {...newPatientForm.register("name")}
                        disabled={isBooking}
                        placeholder="Patient full name"
                        hasError={!!newPatientForm.formState.errors.name}
                      />
                      {newPatientForm.formState.errors.name && (
                        <p className="text-xs text-danger mt-1">{newPatientForm.formState.errors.name.message}</p>
                      )}
                    </Field>

                    <Field label="Phone" htmlFor="np-phone">
                      <Input
                        id="np-phone"
                        type="tel"
                        {...newPatientForm.register("phone")}
                        disabled={isBooking}
                        placeholder="+91 98765 43210"
                      />
                    </Field>

                    <Field label="Gender" htmlFor="np-gender">
                      <Select
                        id="np-gender"
                        {...newPatientForm.register("gender")}
                        disabled={isBooking}
                      >
                        <option value="">Select…</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </Select>
                    </Field>

                    <Field label="Date of Birth" htmlFor="np-dob" hint="Enter DOB or age — either is fine">
                      <CalendarPicker
                        id="np-dob"
                        value={newPatientForm.watch("date_of_birth") ?? undefined}
                        disabled={isBooking}
                        onChange={(d) => {
                          newPatientForm.setValue("date_of_birth", d);
                          const a = calculateAge(d || null);
                          setNewPatientAge(a != null ? String(a) : "");
                        }}
                        placeholder="Date of birth"
                        clearable
                      />
                    </Field>

                    <Field label="Age (years)" htmlFor="np-age" hint="Optional if DOB is provided">
                      <Input
                        id="np-age"
                        type="number"
                        min={0}
                        max={130}
                        value={newPatientAge}
                        disabled={isBooking}
                        placeholder="e.g. 34"
                        onChange={(e) => {
                          setNewPatientAge(e.target.value);
                          // Age drives an approximate DOB; clear any manual DOB
                          // so the two never conflict.
                          newPatientForm.setValue("date_of_birth", "");
                        }}
                      />
                    </Field>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Date & Time ─────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Date &amp; Time</h3>
            <p className="text-xs text-text-secondary mt-0.5">Choose an available slot</p>
          </div>

          <input type="hidden" {...register("scheduled_at")} />

          <Field label="Date" htmlFor="appt-date" required>
            <CalendarPicker
              id="appt-date"
              value={selectedDate}
              disabled={isBooking}
              onChange={(d) => { if (d) setSelectedDate(d); }}
            />
          </Field>

          {/* Slot grid */}
          {slotsLoading ? (
            <div className="flex items-center gap-2 text-sm text-text-secondary py-2">
              <LoadingSpinner size="sm" />
              Loading available slots…
            </div>
          ) : slots.length === 0 ? (
            <div className="rounded-lg bg-background border border-border p-4 text-center">
              <p className="text-sm text-text-secondary">No available slots on this date.</p>
              <p className="text-xs text-text-disabled mt-0.5">Try selecting a different date.</p>
            </div>
          ) : (
            <Field label="Available Times" required error={!selectedSlot && bookError ? "Please select a time slot." : undefined}>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1">
                {slots.map((slot) => {
                  const timePart = slot.split("T")[1]?.slice(0, 5) ?? "";
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={isBooking}
                      onClick={() => selectSlot(slot)}
                      className={cn(
                        "flex items-center justify-center gap-1 py-2 px-1 text-xs rounded-lg border transition-all",
                        selectedSlot === slot
                          ? "border-accent bg-accent text-accent-foreground font-medium"
                          : "border-border text-text-primary hover:border-border-strong hover:bg-background",
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
            <h3 className="text-sm font-semibold text-text-primary">Details</h3>
          </div>

          <Field label="Booking Source" htmlFor="source" required error={errors.source?.message}>
            <Select
              id="source"
              {...register("source")}
              disabled={isBooking}
              hasError={!!errors.source}
            >
              {Object.entries(APPOINTMENT_SOURCE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Duration" htmlFor="duration" hint="Changing duration refreshes available slots">
            <Select
              id="duration"
              {...register("duration_minutes", { valueAsNumber: true })}
              disabled={isBooking}
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

          <Field label="Chief Complaints" htmlFor="chief_complaints" hint="Optional — reason for visit, presenting complaint">
            <Textarea
              id="chief_complaints"
              {...register("chief_complaints")}
              rows={2}
              disabled={isBooking}
              placeholder="e.g. Pain in upper left molar…"
            />
          </Field>
        </div>

        {/* ── Success banner ──────────────────────────────────────── */}
        {success && (
          <div
            role="status"
            className="px-6 py-3 bg-success-bg border-t border-success-border text-sm text-success flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Appointment booked successfully.
          </div>
        )}

        {/* ── Actions ─────────────────────────────────────────────── */}
        <div className="px-6 py-4 bg-background flex items-center justify-end gap-3">
          {onCancel ? (
            <Button variant="outline" size="sm" type="button" onClick={onCancel} disabled={isBooking}>
              Cancel
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <a href={cancelHref ?? "/dentist/appointments"}>Cancel</a>
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={isBooking || !canBook}
            isLoading={isBooking}
          >
            {isBooking ? "Booking…" : "Book Appointment"}
          </Button>
        </div>
      </div>
    </form>
  );
}
