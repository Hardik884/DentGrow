"use client";

import { useState, useTransition, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { RecordPaymentSchema, type RecordPaymentInput, PaymentMethod, type PaymentType } from "@/types";
import { recordPayment } from "@/actions/payments";
import { PAYMENT_METHOD_LABELS } from "@/lib/utils";
import { PatientSearch } from "@/components/shared/PatientSearch";
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { CalendarPicker } from "@/components/ui/calendar-picker";

interface PaymentFormProps {
  patientId?: string;
  patientName?: string;
  appointmentId?: string;
  /** Pre-links this payment to a specific treatment (treatment-wise tracking). */
  treatmentId?: string;
  /** Payment type — "opd" records a standalone consultation payment. Defaults to "treatment". */
  paymentType?: PaymentType;
  /** Pre-fills the Amount field (e.g. the clinic's default OPD fee). Editable. */
  defaultAmount?: number;
  /** When provided, shows a read-only "Recorded By" field (staff member's name). */
  recordedByName?: string;
  onSuccess?: () => void;
  /** When provided, renders a Cancel button that calls this instead of router.back() (modal use). */
  onCancel?: () => void;
}

export function PaymentForm({
  patientId: initialPatientId,
  patientName: initialPatientName,
  appointmentId,
  treatmentId,
  paymentType = "treatment",
  defaultAmount,
  recordedByName,
  onSuccess,
  onCancel,
}: PaymentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState(initialPatientId ?? "");
  const [selectedPatientName, setSelectedPatientName] = useState(initialPatientName ?? "");
  const patientRef = useRef<HTMLDivElement>(null);
  const amountRef  = useRef<HTMLDivElement>(null);

  // The staff member's LOCAL "today" (en-CA → YYYY-MM-DD), not the UTC date, so a
  // clinic ahead of UTC recording near midnight defaults to the correct business
  // day and can still select it. The server re-derives the clinic-local date when
  // this is omitted, so it stays authoritative for the stored value.
  const today = new Intl.DateTimeFormat("en-CA").format(new Date());
  // Payments may be recorded for any historical date (paper-record migration).
  // Future payment dates remain blocked via max={today} on the picker below.

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RecordPaymentInput>({
    resolver: zodResolver(RecordPaymentSchema),
    defaultValues: {
      patient_id: initialPatientId ?? "",
      appointment_id: appointmentId,
      treatment_id: treatmentId,
      amount: defaultAmount != null && defaultAmount > 0 ? defaultAmount : undefined,
      method: PaymentMethod.CASH,
      payment_type: paymentType,
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
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, (errs) => {
      // Scroll to first invalid field on validation failure
      if (errs.patient_id) {
        patientRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (errs.amount) {
        amountRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        amountRef.current?.querySelector("input")?.focus();
      }
    })}>
      {serverError && (
        <div className="mb-4 rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs text-[#DC2626]">
          {serverError}
        </div>
      )}

      <div className="bg-white border border-[#E3E9E6] rounded-xl overflow-hidden divide-y divide-[#EEF2F0]">
        <div className="px-6 py-5 space-y-4">
          {/* Patient */}
          <div className="space-y-1.5" ref={patientRef}>
            <label className="block text-sm font-medium text-[#151918]">
              Patient <span className="text-[#DC2626]" aria-hidden>*</span>
            </label>
            {selectedPatientId ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-[#EEF2F0] border border-[#E3E9E6] rounded-lg">
                  <PatientAvatar name={selectedPatientName || "P"} size="sm" />
                  <span className="text-sm font-medium text-[#151918]">
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
            <input type="hidden" {...register("payment_type")} />
            <input type="hidden" {...register("treatment_id")} />
            {errors.patient_id && (
              <p className="text-xs text-[#DC2626]" role="alert">{errors.patient_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div ref={amountRef}>
              <Field label="Amount (₹)" htmlFor="amount" required error={(errors as Record<string, {message?: string}>).amount?.message ?? (errors.amount ? "Amount must be greater than zero." : undefined)}>
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
            </div>

            <Field label="Payment Method" htmlFor="method" required>
              <Select id="method" {...register("method")}>
                {Object.values(PaymentMethod).map((m) => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Payment Date" htmlFor="payment-date" required error={(errors as Record<string, {message?: string}>).payment_date?.message}>
            <CalendarPicker
              id="payment-date"
              value={watch("payment_date") ?? today}
              max={today}
              onChange={(d) => setValue("payment_date", d, { shouldValidate: true })}
              placeholder="Select payment date"
            />
          </Field>

          <Field label="Notes" htmlFor="notes" hint="Optional — partial payment details, etc.">
            <Textarea
              id="notes"
              {...register("notes")}
              rows={2}
              placeholder={paymentType === "opd" ? "e.g. OPD / consultation fee…" : "e.g. Partial payment for root canal treatment…"}
            />
          </Field>

          {recordedByName && (
            <Field label="Recorded By" htmlFor="recorded-by">
              <Input id="recorded-by" value={recordedByName} readOnly disabled />
            </Field>
          )}
        </div>

        <div className="px-6 py-4 bg-[#F6F8F6] flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" type="button" onClick={() => (onCancel ? onCancel() : router.back())}>
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
