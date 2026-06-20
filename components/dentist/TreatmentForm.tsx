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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SkeletonCard } from "@/components/ui/skeleton";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { Lock, Eye } from "lucide-react";

interface TreatmentFormProps {
  treatmentId?: string;
  appointmentId?: string;
  patientId?: string;
  onSuccess?: (treatment: Treatment) => void;
}

/** Split an ISO datetime string into its "YYYY-MM-DD" and "HH:mm" parts. */
function splitDatetime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  // Handle both "YYYY-MM-DDTHH:mm" and full ISO strings
  const [datePart, timePart = ""] = iso.split("T");
  return {
    date: datePart ?? "",
    time: timePart.slice(0, 5), // "HH:mm"
  };
}

export function TreatmentForm({ treatmentId, appointmentId, patientId, onSuccess }: TreatmentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!treatmentId);

  // Separate controlled state for the date picker fields
  const [performedDate, setPerformedDate] = useState("");
  const [performedTime, setPerformedTime] = useState("");

  const isEdit = !!treatmentId;
  const schema = isEdit ? UpdateTreatmentSchema : CreateTreatmentSchema;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
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

  useEffect(() => {
    if (!treatmentId) return;
    getTreatment(treatmentId).then((result) => {
      if (result.data) {
        const { date, time } = splitDatetime(result.data.performed_at);
        setPerformedDate(date);
        setPerformedTime(time);
        reset({
          treatment_type: result.data.treatment_type,
          internal_notes: result.data.internal_notes ?? "",
          patient_visible_notes: result.data.patient_visible_notes ?? "",
          cost: Number(result.data.cost),
          status: result.data.status,
          performed_at: date ? (time ? `${date}T${time}` : date) : undefined,
        });
      }
      setLoading(false);
    });
  }, [treatmentId, reset]);

  // Keep performed_at in sync whenever the date or time changes
  function handleDateChange(date: string) {
    setPerformedDate(date);
    const combined = date ? (performedTime ? `${date}T${performedTime}` : date) : undefined;
    setValue("performed_at" as keyof CreateTreatmentInput, combined);
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const time = e.target.value;
    setPerformedTime(time);
    const combined = performedDate ? (time ? `${performedDate}T${time}` : performedDate) : undefined;
    setValue("performed_at" as keyof CreateTreatmentInput, combined);
  }

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
          const target = patientId
            ? `/dentist/patients/${patientId}/treatments`
            : "/dentist/treatments";
          router.push(target);
          router.refresh();
        }
      }
    });
  }

  if (loading) return <SkeletonCard className="h-64" />;

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {serverError && (
        <div className="mb-4 rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs text-[#DC2626]">
          {serverError}
        </div>
      )}

      <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden divide-y divide-[#F4F4F5]">
        <div className="px-6 py-5 space-y-4">
          <h2 className="text-sm font-semibold text-[#09090B]">
            {isEdit ? "Edit Treatment" : "New Treatment"}
          </h2>

          {!isEdit && (
            <>
              <input type="hidden" {...register("appointment_id" as keyof CreateTreatmentInput)} />
              <input type="hidden" {...register("patient_id" as keyof CreateTreatmentInput)} />
            </>
          )}

          {/* performed_at is managed via controlled state above; register keeps it in RHF */}
          <input type="hidden" {...register("performed_at" as keyof CreateTreatmentInput)} />

          <Field label="Treatment Type" htmlFor="treatment-type" required error={(errors as Record<string, {message?: string}>).treatment_type?.message}>
            <Input
              id="treatment-type"
              type="text"
              {...register("treatment_type")}
              placeholder="e.g. Root Canal, Cleaning, Extraction"
              hasError={!!(errors as Record<string, unknown>).treatment_type}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Status" htmlFor="status" required>
              <Select id="status" {...register("status")}>
                {Object.values(TreatmentStatus).map((s) => (
                  <option key={s} value={s}>{TREATMENT_STATUS_LABELS[s]}</option>
                ))}
              </Select>
            </Field>

            <Field label="Cost (₹)" htmlFor="cost" required error={(errors as Record<string, {message?: string}>).cost?.message}>
              <Input
                id="cost"
                type="number"
                min={0}
                step="0.01"
                {...register("cost", { valueAsNumber: true })}
                placeholder="0.00"
                hasError={!!(errors as Record<string, unknown>).cost}
              />
            </Field>
          </div>

          <Field label="Performed At" htmlFor="performed-at-date" hint="Optional — date and time the treatment was performed">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <CalendarPicker
                id="performed-at-date"
                value={performedDate}
                onChange={handleDateChange}
                placeholder="Select date"
                clearable
              />
              <Input
                id="performed-at-time"
                type="time"
                value={performedTime}
                onChange={handleTimeChange}
                disabled={!performedDate}
                aria-label="Treatment time"
              />
            </div>
          </Field>
        </div>

        {/* Notes */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#09090B]">Notes</h3>
          </div>

          <Field
            label="Internal Notes"
            htmlFor="internal-notes"
            hint="Dentist only — never shown to the patient"
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-[#71717A]">
                <Lock className="h-3 w-3" aria-hidden />
                <span>Dentist-only</span>
              </div>
              <Textarea
                id="internal-notes"
                {...register("internal_notes")}
                rows={4}
                placeholder="Clinical observations, dentist-only details…"
              />
            </div>
          </Field>

          <Field
            label="Patient-Visible Notes"
            htmlFor="patient-notes"
            hint="Visible to the patient in their portal"
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-[#16A34A]">
                <Eye className="h-3 w-3" aria-hidden />
                <span>Patient can see this</span>
              </div>
              <Textarea
                id="patient-notes"
                {...register("patient_visible_notes")}
                rows={3}
                placeholder="e.g. Filling completed on upper left molar…"
              />
            </div>
          </Field>
        </div>

        <div className="px-6 py-4 bg-[#FAFAFA] flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" type="button" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" size="sm" isLoading={isPending}>
            {isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Treatment"}
          </Button>
        </div>
      </div>
    </form>
  );
}
