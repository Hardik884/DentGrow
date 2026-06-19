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
import { cn } from "@/lib/utils";

interface PatientFormProps {
  /** Pre-populated patient for edit mode. Omit for create mode. */
  patient?: Patient;
  /** Where to redirect after successful submit. */
  successRedirect: string;
  /** Back link to show in the cancel button. */
  cancelHref: string;
}

/**
 * PatientForm
 *
 * Shared create / edit form for patient records.
 * Uses react-hook-form + Zod (CreatePatientSchema).
 * In edit mode the patient prop pre-populates all fields.
 *
 * Calls:
 *   create → actions/patients.ts → createPatient()
 *   edit   → actions/patients.ts → updatePatient()
 *
 * Role-awareness is enforced server-side; this form renders identically
 * for dentist and receptionist — the delete action is handled separately
 * on the profile page (dentist only).
 */
export function PatientForm({
  patient,
  successRedirect,
  cancelHref,
}: PatientFormProps) {
  const router = useRouter();
  const isEdit = Boolean(patient);

  const {
    register,
    handleSubmit,
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

    router.push(successRedirect);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white border rounded-lg divide-y"
      noValidate
    >
      {/* Root-level server error */}
      {errors.root && (
        <div
          role="alert"
          className="px-6 py-4 bg-red-50 border-b border-red-200 text-sm text-red-700 rounded-t-lg"
        >
          {errors.root.message}
        </div>
      )}

      {/* ── Basic Information ─────────────────────────────────────── */}
      <fieldset className="px-6 py-5 space-y-4">
        <legend className="text-sm font-semibold text-gray-900 pb-2">
          Basic Information
        </legend>

        {/* Name */}
        <Field label="Full Name" required error={errors.name?.message}>
          <input
            {...register("name")}
            type="text"
            autoComplete="name"
            disabled={isSubmitting}
            placeholder="e.g. Priya Sharma"
            className={inputClass(!!errors.name)}
          />
        </Field>

        {/* Phone */}
        <Field label="Phone Number" error={errors.phone?.message}>
          <input
            {...register("phone")}
            type="tel"
            autoComplete="tel"
            disabled={isSubmitting}
            placeholder="e.g. +91 98765 43210"
            className={inputClass(!!errors.phone)}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Date of Birth */}
          <Field label="Date of Birth" error={errors.date_of_birth?.message}>
            <input
              {...register("date_of_birth")}
              type="date"
              disabled={isSubmitting}
              max={new Date().toISOString().split("T")[0]}
              className={inputClass(!!errors.date_of_birth)}
            />
          </Field>

          {/* Gender */}
          <Field label="Gender" error={errors.gender?.message}>
            <select
              {...register("gender")}
              disabled={isSubmitting}
              className={inputClass(!!errors.gender)}
            >
              <option value="">Select…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>

        {/* Address */}
        <Field label="Address" error={errors.address?.message}>
          <textarea
            {...register("address")}
            rows={2}
            disabled={isSubmitting}
            placeholder="Street, city, state…"
            className={cn(inputClass(!!errors.address), "resize-none")}
          />
        </Field>
      </fieldset>

      {/* ── Emergency Contact ─────────────────────────────────────── */}
      <fieldset className="px-6 py-5 space-y-4">
        <legend className="text-sm font-semibold text-gray-900 pb-2">
          Emergency Contact <span className="text-gray-400 font-normal">(optional)</span>
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Contact Name"
            error={errors.emergency_contact_name?.message}
          >
            <input
              {...register("emergency_contact_name")}
              type="text"
              disabled={isSubmitting}
              placeholder="Full name"
              className={inputClass(!!errors.emergency_contact_name)}
            />
          </Field>

          <Field
            label="Contact Phone"
            error={errors.emergency_contact_phone?.message}
          >
            <input
              {...register("emergency_contact_phone")}
              type="tel"
              disabled={isSubmitting}
              placeholder="Phone number"
              className={inputClass(!!errors.emergency_contact_phone)}
            />
          </Field>
        </div>
      </fieldset>

      {/* ── Clinical Notes ────────────────────────────────────────── */}
      <fieldset className="px-6 py-5 space-y-4">
        <legend className="text-sm font-semibold text-gray-900 pb-2">
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </legend>

        <Field label="Notes" error={errors.notes?.message}>
          <textarea
            {...register("notes")}
            rows={3}
            disabled={isSubmitting}
            placeholder="Allergies, medical history, admin notes…"
            className={cn(inputClass(!!errors.notes), "resize-none")}
          />
        </Field>
      </fieldset>

      {/* ── Actions ───────────────────────────────────────────────── */}
      <div className="px-6 py-4 bg-gray-50 flex items-center justify-end gap-3 rounded-b-lg">
        <a
          href={cancelHref}
          className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md
                     hover:bg-blue-700 transition-colors
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2
                     disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting
            ? isEdit
              ? "Saving…"
              : "Creating…"
            : isEdit
              ? "Save Changes"
              : "Create Patient"}
        </button>
      </div>
    </form>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, required, error, children }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5" aria-hidden>*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return cn(
    "w-full rounded-md border px-3 py-2 text-sm shadow-sm outline-none transition",
    "placeholder-gray-400 bg-white",
    "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
    "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400",
    hasError ? "border-red-400" : "border-gray-300"
  );
}
