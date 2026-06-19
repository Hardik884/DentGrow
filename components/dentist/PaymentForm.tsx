"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { RecordPaymentSchema, type RecordPaymentInput, PaymentMethod } from "@/types";
import { recordPayment } from "@/actions/payments";
import { PAYMENT_METHOD_LABELS } from "@/lib/utils";
import { PatientSearch } from "@/components/shared/PatientSearch";

interface PaymentFormProps {
  /** Pre-fill patient — bypasses search */
  patientId?: string;
  patientName?: string;
  appointmentId?: string;
  /** Called after successful save; if omitted, router.back() is used */
  onSuccess?: () => void;
}

/**
 * PaymentForm
 *
 * Record payment form — dentist + receptionist roles.
 * Uses react-hook-form + RecordPaymentSchema (Zod).
 * Submits to actions/payments.ts → recordPayment()
 */
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="bg-white border rounded-lg p-6 space-y-5">
        <h2 className="font-semibold text-gray-900">Record Payment</h2>

        {/* Patient selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Patient <span className="text-red-500">*</span>
          </label>

          {selectedPatientId ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 px-3 py-2 border rounded-md bg-gray-50 text-sm text-gray-900">
                {selectedPatientName || selectedPatientId}
              </div>
              {!initialPatientId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPatientId("");
                    setSelectedPatientName("");
                    setValue("patient_id", "");
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <PatientSearch
              onSelect={(patient) => handlePatientSelect(patient.id, patient.name)}
              placeholder="Search patient by name or phone..."
            />
          )}
          <input type="hidden" {...register("patient_id")} value={selectedPatientId} />
          {errors.patient_id && (
            <p className="mt-1 text-xs text-red-600">{errors.patient_id.message}</p>
          )}
        </div>

        {/* Amount + Method row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount (₹) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0.01}
              step="0.01"
              {...register("amount", { valueAsNumber: true })}
              placeholder="0.00"
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.amount && (
              <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Method <span className="text-red-500">*</span>
            </label>
            <select
              {...register("method")}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.values(PaymentMethod).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Payment Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            {...register("payment_date")}
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.payment_date && (
            <p className="mt-1 text-xs text-red-600">{errors.payment_date.message}</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes <span className="text-gray-400 text-xs">(optional)</span>
          </label>
          <textarea
            {...register("notes")}
            rows={2}
            placeholder="e.g. Partial payment for root canal treatment..."
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
          {isPending ? "Recording..." : "Record Payment"}
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
