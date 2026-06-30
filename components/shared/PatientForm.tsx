"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createPatient, updatePatient } from "@/actions/patients";
import {
  CreatePatientSchema,
  type CreatePatientInput,
  type Patient,
} from "@/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { CalendarPicker } from "@/components/ui/calendar-picker";

interface PatientFormProps {
  patient?: Patient;
  successRedirect?: string;
  cancelHref?: string;
  /**
   * Called after a successful patient creation/update.
   * When provided, the form does NOT navigate — the caller handles that.
   * Falls back to successRedirect navigation when omitted (existing behaviour).
   */
  onSuccess?: (patient: Patient) => void;
  /** When true the cancel button is hidden (e.g. inside a modal). */
  hideCancel?: boolean;
}

export function PatientForm({ patient, successRedirect, cancelHref, onSuccess, hideCancel }: PatientFormProps) {
  const router = useRouter();
  const isEdit = Boolean(patient);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<CreatePatientInput>({
    resolver: zodResolver(CreatePatientSchema),
    defaultValues: patient
      ? {
          name: patient.name,
          phone: patient.phone ?? "",
          date_of_birth: patient.date_of_birth ?? "",
          gender: patient.gender ?? undefined,
          address: patient.address ?? "",
          emergency_contact_name: patient.emergency_contact_name ?? "",
          emergency_contact_phone: patient.emergency_contact_phone ?? "",
          notes: patient.notes ?? "",
        }
      : {},
  });

  async function onSubmit(values: CreatePatientInput) {
    const result = isEdit && patient
      ? await updatePatient(patient.id, values)
      : await createPatient(values);

    if (result.error) {
      setError("root", { message: result.error });
      return;
    }

    if (onSuccess && result.data) {
      // Modal / callback path — let caller decide what to do next.
      onSuccess(result.data);
      return;
    }

    // Default navigation path (existing behaviour, unchanged).
    if (successRedirect) {
      router.push(successRedirect);
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, (errs) => {
      // Scroll to the first invalid field
      const firstKey = Object.keys(errs)[0];
      if (firstKey) {
        const el = document.getElementById(
          firstKey === "name" ? "name" :
          firstKey === "phone" ? "phone" :
          firstKey === "date_of_birth" ? "dob" :
          firstKey === "gender" ? "gender" :
          firstKey === "address" ? "address" :
          firstKey === "emergency_contact_name" ? "ec-name" :
          firstKey === "emergency_contact_phone" ? "ec-phone" :
          firstKey === "notes" ? "notes" : firstKey
        );
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus();
        }
      }
    })} className="space-y-0" noValidate>
      {/* Root error */}
      {errors.root && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs text-[#DC2626] flex items-start gap-2"
        >
          <svg className="h-4 w-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          {errors.root.message}
        </div>
      )}

      <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden divide-y divide-[#F4F4F5]">

        {/* ── Basic Information ────────────────────────────────── */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#09090B]">Basic Information</h3>
            <p className="text-xs text-[#71717A] mt-0.5">Core patient demographic details</p>
          </div>

          <Field label="Full Name" htmlFor="name" required error={errors.name?.message}>
            <Input
              id="name"
              {...register("name")}
              type="text"
              autoComplete="name"
              disabled={isSubmitting}
              placeholder="e.g. Priya Sharma"
              hasError={!!errors.name}
            />
          </Field>

          <Field label="Phone Number" htmlFor="phone" error={errors.phone?.message}>
            <Input
              id="phone"
              {...register("phone")}
              type="tel"
              autoComplete="tel"
              disabled={isSubmitting}
              placeholder="e.g. +91 98765 43210"
              hasError={!!errors.phone}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Date of Birth" htmlFor="dob" error={errors.date_of_birth?.message}>
              <CalendarPicker
                id="dob"
                value={watch("date_of_birth") ?? undefined}
                max={new Date().toISOString().split("T")[0]}
                disabled={isSubmitting}
                onChange={(d) => setValue("date_of_birth", d, { shouldValidate: true })}
                placeholder="Select date of birth"
                clearable
              />
            </Field>

            <Field label="Gender" htmlFor="gender" error={errors.gender?.message}>
              <Select
                id="gender"
                {...register("gender")}
                disabled={isSubmitting}
                hasError={!!errors.gender}
              >
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </Select>
            </Field>
          </div>

          <Field label="Address" htmlFor="address" error={errors.address?.message}>
            <Textarea
              id="address"
              {...register("address")}
              disabled={isSubmitting}
              placeholder="Street, city, state…"
              rows={2}
              hasError={!!errors.address}
            />
          </Field>
        </div>

        {/* ── Emergency Contact ────────────────────────────────── */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#09090B]">Emergency Contact</h3>
            <p className="text-xs text-[#71717A] mt-0.5">Optional — contact in case of emergency</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Contact Name" htmlFor="ec-name" error={errors.emergency_contact_name?.message}>
              <Input
                id="ec-name"
                {...register("emergency_contact_name")}
                type="text"
                disabled={isSubmitting}
                placeholder="Full name"
                hasError={!!errors.emergency_contact_name}
              />
            </Field>

            <Field label="Contact Phone" htmlFor="ec-phone" error={errors.emergency_contact_phone?.message}>
              <Input
                id="ec-phone"
                {...register("emergency_contact_phone")}
                type="tel"
                disabled={isSubmitting}
                placeholder="Phone number"
                hasError={!!errors.emergency_contact_phone}
              />
            </Field>
          </div>
        </div>

        {/* ── Notes ────────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#09090B]">Clinical Notes</h3>
            <p className="text-xs text-[#71717A] mt-0.5">Allergies, medical history, admin notes</p>
          </div>

          <Field label="Notes" htmlFor="notes" error={errors.notes?.message}>
            <Textarea
              id="notes"
              {...register("notes")}
              rows={3}
              disabled={isSubmitting}
              placeholder="Allergies, medical history, admin notes…"
              hasError={!!errors.notes}
            />
          </Field>
        </div>

        {/* ── Actions ──────────────────────────────────────────── */}
        <div className="px-6 py-4 bg-[#FAFAFA] flex items-center justify-end gap-3">
          {!hideCancel && (
            <Button variant="outline" size="sm" asChild>
              <a href={cancelHref}>Cancel</a>
            </Button>
          )}
          <Button type="submit" size="sm" isLoading={isSubmitting}>
            {isSubmitting
              ? isEdit ? "Saving…" : "Creating…"
              : isEdit ? "Save Changes" : "Create Patient"}
          </Button>
        </div>
      </div>
    </form>
  );
}
