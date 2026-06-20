"use client";

import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  createFollowUp,
  updateFollowUp,
  completeFollowUp,
  cancelFollowUp,
  getPatientAppointmentsForFollowUp,
  getPatientTreatmentsForFollowUp,
} from "@/actions/follow-ups";
import { searchPatients } from "@/actions/patients";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import {
  FOLLOW_UP_STATUS_LABELS,
  formatDate,
  formatDateTime,
} from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import Link from "next/link";
import { CheckCircle2, X, User, Calendar, Stethoscope } from "lucide-react";
import type { FollowUpWithRelations, Patient } from "@/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const FOLLOW_UP_TYPE_OPTIONS = [
  { value: "review",            label: "Review" },
  { value: "cleaning",          label: "Cleaning" },
  { value: "crown_check",       label: "Crown Check" },
  { value: "root_canal_review", label: "Root Canal Review" },
  { value: "implant_review",    label: "Implant Review" },
  { value: "payment_reminder",  label: "Payment Reminder" },
  { value: "consultation",      label: "Consultation" },
  { value: "custom",            label: "Custom" },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PatientOption {
  id: string;
  name: string;
  phone: string | null;
}

interface AppointmentOption {
  id: string;
  scheduled_at: string;
  status: string;
}

interface TreatmentOption {
  id: string;
  treatment_type: string;
  status: string;
}

interface FollowUpFormProps {
  followUpId?: string;
  /** Pre-selected patient — skips patient search when set */
  patientId?: string;
  patientName?: string;
  appointmentId?: string;
  treatmentId?: string;
  initialData?: FollowUpWithRelations;
  onSuccess?: () => void;
  role?: "dentist" | "receptionist";
}

// =============================================================================
// FollowUpForm
// =============================================================================

export function FollowUpForm({
  followUpId,
  patientId: prefillPatientId,
  patientName: prefillPatientName,
  appointmentId: prefillAppointmentId,
  treatmentId: prefillTreatmentId,
  initialData,
  onSuccess,
  role = "dentist",
}: FollowUpFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [followUpType, setFollowUpType] = useState(
    initialData?.follow_up_type ?? ""
  );
  const [dueDate, setDueDate]   = useState(initialData?.due_date ?? "");
  const [notes, setNotes]       = useState(initialData?.notes ?? "");
  const [formError, setFormError]     = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // ── Patient selection ───────────────────────────────────────────────────────
  const resolvedInitialPatient: PatientOption | null = initialData?.patient
    ? { id: initialData.patient.id, name: initialData.patient.name, phone: initialData.patient.phone ?? null }
    : prefillPatientId && prefillPatientName
      ? { id: prefillPatientId, name: prefillPatientName, phone: null }
      : prefillPatientId
        ? { id: prefillPatientId, name: "Loading…", phone: null }
        : null;

  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(
    resolvedInitialPatient
  );
  const [patientQuery, setPatientQuery]       = useState(resolvedInitialPatient?.name ?? "");
  const [patientResults, setPatientResults]   = useState<Patient[]>([]);
  const [patientDropOpen, setPatientDropOpen] = useState(false);
  const [patientLoading, setPatientLoading]   = useState(false);
  const patientSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Related appointment & treatment dropdowns ───────────────────────────────
  const [selectedAppointmentId, setSelectedAppointmentId] = useState(
    prefillAppointmentId ?? initialData?.appointment_id ?? ""
  );
  const [selectedTreatmentId, setSelectedTreatmentId] = useState(
    prefillTreatmentId ?? initialData?.treatment_id ?? ""
  );
  const [appointmentOptions, setAppointmentOptions] = useState<AppointmentOption[]>([]);
  const [treatmentOptions, setTreatmentOptions]     = useState<TreatmentOption[]>([]);
  const [loadingRelated, setLoadingRelated]         = useState(false);
  const [relatedError, setRelatedError]             = useState<string | null>(null);

  // ── Action dialogs ──────────────────────────────────────────────────────────
  const currentStatus = initialData?.status ?? null;
  const isPendingStatus = currentStatus === "pending";
  const isDentist  = role === "dentist";
  const [confirmAction, setConfirmAction]           = useState<"complete" | "cancel" | null>(null);
  const [isActioning, startActionTransition]        = useTransition();

  // ── Load related records whenever patient changes ───────────────────────────
  const loadRelatedOptions = useCallback(async (pid: string) => {
    if (!pid) {
      setAppointmentOptions([]);
      setTreatmentOptions([]);
      return;
    }
    setLoadingRelated(true);
    setRelatedError(null);
    try {
      const [apptResult, txResult] = await Promise.all([
        getPatientAppointmentsForFollowUp(pid),
        getPatientTreatmentsForFollowUp(pid),
      ]);
      if (apptResult.error) {
        console.error("[FollowUpForm] appointments fetch error:", apptResult.error);
      }
      if (txResult.error) {
        console.error("[FollowUpForm] treatments fetch error:", txResult.error);
        setRelatedError(txResult.error);
      }
      // Always update options — null data falls back to [] so dropdown renders cleanly
      setAppointmentOptions((apptResult.data ?? []) as AppointmentOption[]);
      setTreatmentOptions((txResult.data ?? []) as TreatmentOption[]);
    } catch (err) {
      console.error("[FollowUpForm] loadRelatedOptions unexpected:", err);
      setRelatedError("Could not load related records.");
      setAppointmentOptions([]);
      setTreatmentOptions([]);
    } finally {
      setLoadingRelated(false);
    }
  }, []); // no deps — all setters are stable React dispatch functions

  useEffect(() => {
    if (selectedPatient?.id) {
      loadRelatedOptions(selectedPatient.id);
    }
  }, [selectedPatient?.id, loadRelatedOptions]);

  // ── Sync initialData if editing ─────────────────────────────────────────────
  useEffect(() => {
    if (initialData) {
      setFollowUpType(initialData.follow_up_type ?? "");
      setDueDate(initialData.due_date);
      setNotes(initialData.notes ?? "");
      if (initialData.appointment_id) setSelectedAppointmentId(initialData.appointment_id);
      if (initialData.treatment_id)   setSelectedTreatmentId(initialData.treatment_id);
    }
  }, [initialData]);

  // ── Patient search ──────────────────────────────────────────────────────────
  const handlePatientQueryChange = useCallback(
    (value: string) => {
      setPatientQuery(value);
      setSelectedPatient(null);
      setSelectedAppointmentId("");
      setSelectedTreatmentId("");
      setAppointmentOptions([]);
      setTreatmentOptions([]);
      setRelatedError(null);

      if (patientSearchTimerRef.current) {
        clearTimeout(patientSearchTimerRef.current);
        patientSearchTimerRef.current = null;
      }

      if (value.trim().length < 2) {
        setPatientResults([]);
        setPatientDropOpen(false);
        return;
      }

      patientSearchTimerRef.current = setTimeout(async () => {
        setPatientLoading(true);
        const result = await searchPatients(value.trim());
        setPatientResults(result.data ?? []);
        setPatientDropOpen(true);
        setPatientLoading(false);
      }, 300);
    },
    [] // no deps — uses ref for timer, all setters are stable
  );

  function handleSelectPatient(p: Patient) {
    setSelectedPatient({ id: p.id, name: p.name, phone: p.phone ?? null });
    setPatientQuery(p.name);
    setPatientResults([]);
    setPatientDropOpen(false);
    // reset relation selections whenever patient changes
    setSelectedAppointmentId("");
    setSelectedTreatmentId("");
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const patId = selectedPatient?.id ?? initialData?.patient_id ?? "";

    if (!patId) {
      setFormError("Please select a patient.");
      return;
    }
    if (!followUpType) {
      setFormError("Please select a follow-up type.");
      return;
    }
    if (!dueDate) {
      setFormError("Due date is required.");
      return;
    }

    const input = {
      patient_id:     patId,
      follow_up_type: followUpType,
      appointment_id: selectedAppointmentId || undefined,
      treatment_id:   selectedTreatmentId   || undefined,
      due_date:       dueDate,
      notes:          notes.trim() || undefined,
    };

    startTransition(async () => {
      const result = followUpId
        ? await updateFollowUp(followUpId, input)
        : await createFollowUp(input);

      if (result.error) {
        setFormError(result.error);
        return;
      }

      setFormSuccess(followUpId ? "Follow-up updated." : "Follow-up created.");

      if (!followUpId && result.data) {
        router.push(`/dentist/follow-ups/${result.data.id}`);
        return;
      }
      onSuccess?.();
    });
  }

  // ── Complete / Cancel action ─────────────────────────────────────────────────
  function handleConfirm() {
    if (!followUpId || !confirmAction) return;
    setFormError(null);
    startActionTransition(async () => {
      const result =
        confirmAction === "complete"
          ? await completeFollowUp(followUpId)
          : await cancelFollowUp(followUpId);
      setConfirmAction(null);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const isEditable = !currentStatus || currentStatus === "pending";
  const isReadOnly = !isEditable || isPending;

  // ── Patient is locked when editing an existing follow-up ─────────────────────
  const patientLocked = !!followUpId;

  return (
    <>
      <div className="bg-white border border-border rounded-xl overflow-hidden max-w-2xl">

        {/* ── Header (edit mode only) ── */}
        {currentStatus && (
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Follow-Up Details</h2>
            <StatusBadge
              label={FOLLOW_UP_STATUS_LABELS[currentStatus]}
              variant={
                currentStatus === "completed" ? "success"
                  : currentStatus === "cancelled" ? "error"
                  : "default"
              }
            />
          </div>
        )}

        <div className="px-6 py-5 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* ── Patient ── */}
            <Field
              label="Patient"
              htmlFor="patient_search"
              required
              hint={
                patientLocked
                  ? undefined
                  : "Search by name or phone number"
              }
            >
              {patientLocked ? (
                /* Edit mode: show patient as read-only card */
                <div className="flex items-center gap-3 rounded-lg border border-border bg-[#FAFAFA] px-3 py-2">
                  <PatientAvatar
                    name={selectedPatient?.name ?? initialData?.patient?.name ?? "?"}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {selectedPatient?.name ?? initialData?.patient?.name ?? "Unknown patient"}
                    </p>
                    {(selectedPatient?.phone ?? initialData?.patient?.phone) && (
                      <p className="text-xs text-text-secondary">
                        {selectedPatient?.phone ?? initialData?.patient?.phone}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/dentist/patients/${selectedPatient?.id ?? initialData?.patient_id}`}
                    className="text-xs text-blue-600 hover:underline shrink-0"
                    tabIndex={-1}
                  >
                    View
                  </Link>
                </div>
              ) : (
                /* Create mode: patient search */
                <div className="relative">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
                      <User className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <Input
                      id="patient_search"
                      type="search"
                      value={patientQuery}
                      onChange={(e) => handlePatientQueryChange(e.target.value)}
                      placeholder="Search by name or phone…"
                      autoComplete="off"
                      disabled={isReadOnly}
                      className="pl-9"
                      onBlur={() => setTimeout(() => setPatientDropOpen(false), 150)}
                      onFocus={() => patientResults.length > 0 && setPatientDropOpen(true)}
                    />
                    {patientLoading && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <LoadingSpinner size="sm" />
                      </span>
                    )}
                  </div>

                  {/* Selected patient chip */}
                  {selectedPatient && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-[#FAFAFA] px-3 py-2">
                      <PatientAvatar name={selectedPatient.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary">{selectedPatient.name}</p>
                        {selectedPatient.phone && (
                          <p className="text-xs text-text-secondary">{selectedPatient.phone}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPatient(null);
                          setPatientQuery("");
                          setSelectedAppointmentId("");
                          setSelectedTreatmentId("");
                          setAppointmentOptions([]);
                          setTreatmentOptions([]);
                          setRelatedError(null);
                        }}
                        className="text-text-secondary hover:text-text-primary transition-colors"
                        aria-label="Clear patient selection"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Search results dropdown */}
                  {patientDropOpen && patientResults.length > 0 && (
                    <ul className="absolute z-20 w-full mt-1 bg-white border border-border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                      {patientResults.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelectPatient(p)}
                            className="w-full px-4 py-2.5 text-left hover:bg-[#FAFAFA] flex items-center gap-3 transition-colors"
                          >
                            <PatientAvatar name={p.name} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-text-primary truncate">{p.name}</p>
                              {p.phone && (
                                <p className="text-xs text-text-secondary">{p.phone}</p>
                              )}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {patientDropOpen && !patientLoading && patientQuery.trim().length >= 2 && patientResults.length === 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-border rounded-xl shadow-lg p-4">
                      <p className="text-sm text-text-secondary text-center">No patients found</p>
                    </div>
                  )}
                </div>
              )}
            </Field>

            {/* ── Follow-Up Type + Due Date (side by side on md+) ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Follow-Up Type" htmlFor="follow_up_type" required>
                <Select
                  id="follow_up_type"
                  value={followUpType}
                  onChange={(e) => setFollowUpType(e.target.value)}
                  disabled={isReadOnly}
                  hasError={!followUpType && !!formError}
                >
                  <option value="" disabled>Select type…</option>
                  {FOLLOW_UP_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Due Date" htmlFor="due_date" required>
                <CalendarPicker
                  id="due_date"
                  value={dueDate}
                  onChange={(d) => setDueDate(d ?? "")}
                  disabled={isReadOnly}
                  placeholder="Select due date"
                  clearable
                />
              </Field>
            </div>

            {/* ── Optional: Related Appointment ── */}
            <Field
              label="Related Appointment"
              htmlFor="appointment_id"
              hint="Optional — link to the appointment that prompted this follow-up"
            >
              {loadingRelated ? (
                <div className="flex items-center gap-2 h-9 text-sm text-text-secondary">
                  <LoadingSpinner size="sm" />
                  <span>Loading appointments…</span>
                </div>
              ) : (
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
                    <Calendar className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <Select
                    id="appointment_id"
                    value={selectedAppointmentId}
                    onChange={(e) => setSelectedAppointmentId(e.target.value)}
                    disabled={isReadOnly || (!selectedPatient && !patientLocked)}
                    className="pl-9"
                  >
                    <option value="">None</option>
                    {appointmentOptions.map((appt) => (
                      <option key={appt.id} value={appt.id}>
                        {formatDateTime(appt.scheduled_at)} — {appt.status}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </Field>

            {/* ── Optional: Related Treatment ── */}
            <Field
              label="Related Treatment"
              htmlFor="treatment_id"
              hint="Optional — link to the specific treatment this follow-up is for"
            >
              {loadingRelated ? (
                <div className="flex items-center gap-2 h-9 text-sm text-text-secondary">
                  <LoadingSpinner size="sm" />
                  <span>Loading treatments…</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
                      <Stethoscope className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <Select
                      id="treatment_id"
                      value={selectedTreatmentId}
                      onChange={(e) => setSelectedTreatmentId(e.target.value)}
                      disabled={isReadOnly || (!selectedPatient && !patientLocked)}
                      className="pl-9"
                    >
                      <option value="">None</option>
                      {treatmentOptions.map((tx) => (
                        <option key={tx.id} value={tx.id}>
                          {tx.treatment_type} — {tx.status}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {relatedError && (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-danger">{relatedError}</p>
                      {selectedPatient?.id && (
                        <button
                          type="button"
                          onClick={() => loadRelatedOptions(selectedPatient.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )}
                  {!relatedError && selectedPatient && treatmentOptions.length === 0 && !loadingRelated && (
                    <p className="text-xs text-text-secondary">No treatments on record for this patient.</p>
                  )}
                </div>
              )}
            </Field>

            {/* ── Notes ── */}
            <Field
              label="Notes"
              htmlFor="notes"
              hint="Additional context or instructions for this follow-up"
            >
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isReadOnly}
                placeholder="e.g. Check healing after root canal, patient reported discomfort last visit…"
              />
            </Field>

            {/* ── Metadata (edit mode) ── */}
            {followUpId && initialData && (
              <div className="grid grid-cols-2 gap-3 text-xs text-text-secondary pt-1 border-t border-border">
                <div>
                  <span className="block font-medium text-text-primary mb-0.5">Created</span>
                  {formatDate(initialData.created_at)}
                </div>
                {initialData.updated_at !== initialData.created_at && (
                  <div>
                    <span className="block font-medium text-text-primary mb-0.5">Last Updated</span>
                    {formatDate(initialData.updated_at)}
                  </div>
                )}
              </div>
            )}

            {/* ── Error / Success messages ── */}
            {formError && (
              <div
                role="alert"
                className="rounded-lg bg-danger-bg border border-[#FECACA] px-4 py-3 text-xs text-danger"
              >
                {formError}
              </div>
            )}
            {formSuccess && (
              <div
                role="status"
                className="rounded-lg bg-success-bg border border-[#BBF7D0] px-4 py-3 text-xs text-success flex items-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                {formSuccess}
              </div>
            )}

            {/* ── Actions ── */}
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {isEditable && (
                <Button
                  type="submit"
                  size="sm"
                  disabled={isReadOnly}
                  isLoading={isPending}
                >
                  {isPending
                    ? "Saving…"
                    : followUpId
                      ? "Save Changes"
                      : "Create Follow-Up"}
                </Button>
              )}

              {isDentist && followUpId && isPendingStatus && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setConfirmAction("complete")}
                    disabled={isActioning}
                    className="bg-success hover:bg-[#15803D]"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Mark Complete
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmAction("cancel")}
                    disabled={isActioning}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Cancel Follow-Up
                  </Button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction === "complete"
            ? "Mark Follow-Up as Complete?"
            : "Cancel Follow-Up?"
        }
        description={
          confirmAction === "complete"
            ? "This will mark the follow-up as completed. This action cannot be undone."
            : "This will cancel the follow-up. This action cannot be undone."
        }
        confirmLabel={confirmAction === "complete" ? "Mark Complete" : "Cancel Follow-Up"}
        variant={confirmAction === "cancel" ? "danger" : "default"}
        cancelLabel="Go Back"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
        isLoading={isActioning}
      />
    </>
  );
}
