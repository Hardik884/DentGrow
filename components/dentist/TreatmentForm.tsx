"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  CreateTreatmentSchema,
  UpdateTreatmentSchema,
  type CreateTreatmentInput,
  type UpdateTreatmentInput,
  type Treatment,
  TreatmentStatus,
} from "@/types";
import { createTreatment, getTreatment, updateTreatment } from "@/actions/treatments";
import { TREATMENT_STATUS_LABELS } from "@/lib/utils";

interface TreatmentFormProps {
  /** undefined = new treatment */
  treatmentId?: string;
  appointmentId?: string;
  patientId?: string;
  /** Called after successful save */
  onSuccess?: (treatment: Treatment) => void;
}

/**
 * TreatmentForm
 *
 * Create + edit treatment form — dentist role only.
 * Shows both internal_notes and patient_visible_notes.
 * Uses react-hook-form + Zod (CreateTreatmentSchema / UpdateTreatmentSchema).
 */
export function TreatmentForm({
  treatmentId,
  appointmentId,
  patientId,
  onSuccess,
}: TreatmentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!treatmentId);

  const isEdit = !!treatmentId;
  const schema = isEdit ? UpdateTreatmentSchema : CreateTreatmentSchema;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateTreatmentInput | UpdateTreatmentInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      appointment_id: appointmentId ?? "",
      patient_id: patientId ?? "",
      treatment_type: "",
      internal_notes: "",
      patient_visible_notes: "",
      cost: 0,
      status: TreatmentStatus.PLANNED,
      performed_at: undefined,
    },
  });

  // Load existing treatment data for edit mode
  useEffect(() => {
    if (!treatmentId) return;
    getTreatment(treatmentId).then((result) => {
      if (result.data) {
        reset({
          treatment_type: result.data.treatment_type,
          internal_notes: result.data.internal_notes ?? "",
          patient_visible_notes: result.data.patient_visible_notes ?? "",
          cost: Number(result.data.cost),
          status: result.data.status,
          performed_at: result.data.performed_at
            ? new Date(result.data.performed_at).toISOString().slice(0, 16)
            : undefined,
        });
      }
      setLoading(false);
    });
  }, [treatmentId, reset]);

  function onSubmit(values: CreateTreatmentInput | UpdateTreatmentInput) {
    setServerError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateTreatment(treatmentId!, values)
        : await createTreatment(values);

      if (result.error) {
        setServerError(result.error);
        return;
      }

      if (result.data) {
        if (onSuccess) {
          onSuccess(result.data);
        } else {
          // Navigate back to patient treatments or treatments list
          const target = patientId
            ? `/dentist/patients/${patientId}/treatments`
            : "/dentist/treatments";
          router.push(target);
          router.refresh();
        }
      }
    });
  }

  if (loading) {
    return (
      <div className="bg-white border rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="h-10 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="bg-white border rounded-lg p-6 space-y-5">
        <h2 className="font-semibold text-gray-900">
          {isEdit ? "Edit Treatment" : "New Treatment"}
        </h2>

        {/* Hidden fields for new treatment */}
        {!isEdit && (
          <>
            <input type="hidden" {...register("appointment_id" as keyof CreateTreatmentInput)} />
            <input type="hidden" {...register("patient_id" as keyof CreateTreatmentInput)} />
          </>
        )}

        {/* Treatment Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Treatment Type <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            {...register("treatment_type")}
            placeholder="e.g. Root Canal, Cleaning, Extraction"
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.treatment_type && (
            <p className="mt-1 text-xs text-red-600">{errors.treatment_type.message}</p>
          )}
        </div>

        {/* Status + Cost row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status <span className="text-red-500">*</span>
            </label>
            <select
              {...register("status")}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.values(TreatmentStatus).map((s) => (
                <option key={s} value={s}>
                  {TREATMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cost (₹) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              {...register("cost", { valueAsNumber: true })}
              placeholder="0.00"
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.cost && (
              <p className="mt-1 text-xs text-red-600">{errors.cost.message}</p>
            )}
          </div>
        </div>

        {/* Performed At */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Performed At
          </label>
          <input
            type="datetime-local"
            {...register("performed_at")}
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Internal Notes — dentist only */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Internal Notes
            <span className="ml-2 text-xs font-normal text-gray-400">
              (dentist only — not visible to patient)
            </span>
          </label>
          <textarea
            {...register("internal_notes")}
            rows={4}
            placeholder="Clinical observations, dentist-only details..."
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </div>

        {/* Patient-Visible Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Patient-Visible Notes
            <span className="ml-2 text-xs font-normal text-gray-400">
              (visible in patient portal)
            </span>
          </label>
          <textarea
            {...register("patient_visible_notes")}
            rows={3}
            placeholder="e.g. Filling completed on upper left molar..."
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </div>

        {serverError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {serverError}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Treatment"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
