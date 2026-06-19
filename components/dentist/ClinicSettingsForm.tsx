"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateClinicSettings } from "@/actions/clinic-settings";
import {
  UpdateClinicSettingsSchema,
  type UpdateClinicSettingsInput,
  type ClinicSettings,
} from "@/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { CheckCircle2, Link as LinkIcon } from "lucide-react";
import Link from "next/link";

const TIMEZONES = [
  "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Sydney", "Europe/London", "Europe/Paris",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "UTC",
];

const DAYS = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
] as const;

type DayKey = (typeof DAYS)[number]["key"];

interface ClinicSettingsFormProps {
  initialSettings: ClinicSettings | null;
}

export function ClinicSettingsForm({ initialSettings }: ClinicSettingsFormProps) {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const defaultHours: UpdateClinicSettingsInput["clinic_hours"] = {
    monday:    getDay("monday",    initialSettings, { open: "09:00", close: "18:00", is_open: true }),
    tuesday:   getDay("tuesday",   initialSettings, { open: "09:00", close: "18:00", is_open: true }),
    wednesday: getDay("wednesday", initialSettings, { open: "09:00", close: "18:00", is_open: true }),
    thursday:  getDay("thursday",  initialSettings, { open: "09:00", close: "18:00", is_open: true }),
    friday:    getDay("friday",    initialSettings, { open: "09:00", close: "17:00", is_open: true }),
    saturday:  getDay("saturday",  initialSettings, { open: "10:00", close: "14:00", is_open: true }),
    sunday:    getDay("sunday",    initialSettings, { open: null,    close: null,    is_open: false }),
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    setError,
    clearErrors,
  } = useForm<UpdateClinicSettingsInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(UpdateClinicSettingsSchema) as any,
    defaultValues: {
      clinic_name: initialSettings?.clinic_name ?? "",
      phone: initialSettings?.phone ?? "",
      email: initialSettings?.email ?? "",
      address: initialSettings?.address ?? "",
      average_appointment_duration: initialSettings?.average_appointment_duration ?? 30,
      timezone: initialSettings?.timezone ?? "Asia/Kolkata",
      clinic_hours: defaultHours,
    },
  });

  const clinicHours = watch("clinic_hours");

  async function onSubmit(values: UpdateClinicSettingsInput) {
    setSuccessMessage(null);
    clearErrors();
    const result = await updateClinicSettings(values);
    if (result.error) {
      setError("root", { message: result.error });
      return;
    }
    setSuccessMessage("Settings saved successfully.");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl" noValidate>
      {/* Root error */}
      {errors.root && (
        <div role="alert" className="mb-4 rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs text-[#DC2626]">
          {errors.root.message}
        </div>
      )}

      {/* Success */}
      {successMessage && (
        <div role="status" className="mb-4 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] px-4 py-3 text-xs text-[#16A34A] flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          {successMessage}
        </div>
      )}

      <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden divide-y divide-[#F4F4F5]">

        {/* ── Clinic Info ─────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-4">
          <h3 className="text-sm font-semibold text-[#09090B]">Clinic Information</h3>

          <Field label="Clinic Name" htmlFor="clinic_name" required error={errors.clinic_name?.message}>
            <Input id="clinic_name" type="text" {...register("clinic_name")} disabled={isSubmitting} hasError={!!errors.clinic_name} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
              <Input id="phone" type="tel" {...register("phone")} disabled={isSubmitting} placeholder="+91 98765 43210" />
            </Field>
            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" {...register("email")} disabled={isSubmitting} placeholder="clinic@example.com" />
            </Field>
          </div>

          <Field label="Address" htmlFor="address">
            <Textarea id="address" {...register("address")} rows={2} disabled={isSubmitting} placeholder="123 Dental Street, City, State" />
          </Field>
        </div>

        {/* ── Operational ─────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-4">
          <h3 className="text-sm font-semibold text-[#09090B]">Operational Settings</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Avg. Appointment Duration"
              htmlFor="avg_duration"
              required
              hint="Used for wait-time estimates in the queue"
            >
              <Select id="avg_duration" {...register("average_appointment_duration", { valueAsNumber: true })} disabled={isSubmitting}>
                {[10, 15, 20, 30, 45, 60, 90].map((d) => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </Select>
            </Field>

            <Field
              label="Timezone"
              htmlFor="timezone"
              required
              hint="Controls slot boundaries and queue calculations"
            >
              <Select id="timezone" {...register("timezone")} disabled={isSubmitting}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        {/* ── Clinic Hours ─────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#09090B]">Clinic Hours</h3>
            <p className="text-xs text-[#71717A] mt-0.5">
              Used for AI assistant responses.{" "}
              <Link href="/dentist/settings/availability" className="underline underline-offset-4 hover:text-[#09090B]">
                Manage booking slots separately
              </Link>
              .
            </p>
          </div>

          <div className="space-y-2">
            {DAYS.map((day) => {
              const dayHours = clinicHours?.[day.key as DayKey];
              const isOpen = dayHours?.is_open ?? false;

              return (
                <div key={day.key} className="flex items-center gap-3 py-1.5">
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      const current = watch(`clinic_hours.${day.key as DayKey}`);
                      setValue(`clinic_hours.${day.key as DayKey}`, {
                        ...current,
                        is_open: !current?.is_open,
                        open: !current?.is_open ? (current?.open ?? "09:00") : current?.open ?? null,
                        close: !current?.is_open ? (current?.close ?? "18:00") : current?.close ?? null,
                      });
                    }}
                    disabled={isSubmitting}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181B]",
                      "disabled:cursor-not-allowed",
                      isOpen ? "bg-[#18181B]" : "bg-[#E4E4E7]"
                    )}
                    aria-pressed={isOpen}
                    aria-label={`${day.label}: ${isOpen ? "open" : "closed"}`}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform",
                        isOpen ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>

                  <span className={cn("w-8 text-xs font-medium", isOpen ? "text-[#09090B]" : "text-[#A1A1AA]")}>
                    {day.label}
                  </span>

                  {isOpen ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        {...register(`clinic_hours.${day.key as DayKey}.open`)}
                        disabled={isSubmitting}
                        className="w-28 text-xs"
                      />
                      <span className="text-xs text-[#71717A]">–</span>
                      <Input
                        type="time"
                        {...register(`clinic_hours.${day.key as DayKey}.close`)}
                        disabled={isSubmitting}
                        className="w-28 text-xs"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-[#A1A1AA]">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Actions ─────────────────────────────────────────── */}
        <div className="px-6 py-4 bg-[#FAFAFA] flex items-center justify-end">
          <Button type="submit" size="sm" isLoading={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </div>
    </form>
  );
}

// Helper: extract day settings from existing settings
function getDay(
  day: string,
  settings: ClinicSettings | null,
  fallback: { open: string | null; close: string | null; is_open: boolean }
) {
  if (!settings?.clinic_hours) return fallback;
  const hours = settings.clinic_hours as Record<string, { open: string | null; close: string | null; is_open: boolean }>;
  return hours[day] ?? fallback;
}
