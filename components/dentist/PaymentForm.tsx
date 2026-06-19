"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { RecordPaymentSchema, type RecordPaymentInput, PaymentMethod } from "@/types";
import { recordPayment } from "@/actions/payments";
import { PAYMENT_METHOD_LABELS } from "@/lib/utils";
import { PatientSearch } from "@/components/shared/PatientSearch";
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

interface PaymentFormProps {
  patientId?: string;
  patientName?: string;
  appointmentId?: string;
  onSuccess?: () => void;
}

export function PaymentForm({
  patientId: initialPatientId,
  patientName: initialPatientName,
  appointmentId,
  onSuccess,
}: PaymentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState(initialPatientId ?? "");
  const [selectedPatientName, setSelectedPatientName] = useState(initialPatientName ?? "");

  const today = new Date().toISOString().split("T")[0];

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RecordPaymentInput>({
    resolver: zodResolver(RecordPaymentSchema),
    defaultValues: {
      patient_id: initialPatientId ?? "",
      appointment_id: appointmentId,
      amount: undefined,
      method: PaymentMethod.CASH,
      payment_date: today,
      notes: "",
    },
  });

  function handlePatientSelect(id: string, name: string) {
    setSelectedPatientId(id);
    setSelectedPatientName(name);
    setValue("patient_id", id, { shouldValidate: true });
  }

  function onSubmit(values: RecordPaymentInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await recordPayment(values);
      if (result.error) {
        setServerError(result.error);
        return;
      }
      if (onSuccess) {
        onSuccess();
      } else {
        router.back();
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {serverError && (
        <div className="mb-4 rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs text-[#DC2626]">
          {serverError}
        </div>
      )}

      <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden divide-y divide-[#F4F4F5]">
        <div className="px-6 py-5 space-y-4">
          <h2 className="text-sm font-semibold text-[#09090B]">Record Payment</h2>

          {/* Patient */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#09090B]">
              Patient <span className="text-[#DC2626]" aria-hidden>*</span>
            </label>
            {selectedPatientId ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-[#F4F4F5] border border-[#E4E4E7] rounded-lg">
                  <PatientAvatar name={selectedPatientName || "P"} size="sm" />
                  <span className="text-sm font-medium text-[#09090B]">
                    {selectedPatientName || selectedPatientId}
                  </span>
                </div>
                {!initialPatientId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => {
                      setSelectedPatientId("");
                      setSelectedPatientName("");
                      setValue("patient_id", "");
                    }}
                  >
                    Change
                  </Button>
                )}
              </div>
            ) : (
              <PatientSearch
                onSelect={(patient) => handlePatientSelect(patient.id, patient.name)}
                placeholder="Search patient by name or phone…"
              />
            )}
            <input type="hidden" {...register("patient_id")} value={selectedPatientId} />
            {errors.patient_id && (
              <p className="text-xs text-[#DC2626]" role="alert">{errors.patient_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Amount (₹)" htmlFor="amount" required error={(errors as Record<string, {message?: string}>).amount?.message}>
              <Input
                id="amount"
                type="number"
                min={0.01}
                step="0.01"
                {...register("amount", { valueAsNumber: true })}
                placeholder="0.00"
                hasError={!!(errors as Record<string, unknown>).amount}
              />
            </Field>

            <Field label="Payment Method" htmlFor="method" required>
              <Select id="method" {...register("method")}>
                {Object.values(PaymentMethod).map((m) => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Payment Date" htmlFor="payment-date" required error={(errors as Record<string, {message?: string}>).payment_date?.message}>
            <Input
              id="payment-date"
              type="date"
              {...register("payment_date")}
              hasError={!!(errors as Record<string, unknown>).payment_date}
            />
          </Field>

          <Field label="Notes" htmlFor="notes" hint="Optional — partial payment details, etc.">
            <Textarea
              id="notes"
              {...register("notes")}
              rows={2}
              placeholder="e.g. Partial payment for root canal treatment…"
            />
          </Field>
        </div>

        <div className="px-6 py-4 bg-[#FAFAFA] flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" type="button" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" size="sm" isLoading={isPending}>
            {isPending ? "Recording…" : "Record Payment"}
          </Button>
        </div>
      </div>
    </form>
  );
}
