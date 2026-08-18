"use client";

import { useState, useTransition } from "react";
import type { Consultant, ConsultancySchedule, UnavailableDate } from "@/types";
import {
  createConsultant,
  updateConsultant,
  deleteConsultant,
  createConsultancySchedule,
  deleteConsultancySchedule,
  createUnavailableDate,
  deleteUnavailableDate,
} from "@/actions/consultants";
import { formatDate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, Plus, Trash2, Pencil, CalendarOff, Clock, X, Check } from "lucide-react";

function timeLabel(hhmmss: string): string {
  const [h, m] = hhmmss.split(":");
  const hour = parseInt(h ?? "0", 10);
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m ?? "00"} ${suffix}`;
}

interface ConsultantSettingsProps {
  initialConsultants: Consultant[];
  initialSchedules: ConsultancySchedule[];
  initialUnavailableDates: UnavailableDate[];
}

export function ConsultantSettings({
  initialConsultants,
  initialSchedules,
  initialUnavailableDates,
}: ConsultantSettingsProps) {
  return (
    <div className="space-y-6">
      <ConsultantDirectory initial={initialConsultants} />
      <ConsultancyScheduleSection initial={initialSchedules} />
      <UnavailableDatesSection initial={initialUnavailableDates} />
    </div>
  );
}

// =============================================================================
// Consultant Directory
// =============================================================================

function ConsultantDirectory({ initial }: { initial: Consultant[] }) {
  const [consultants, setConsultants] = useState<Consultant[]>(initial);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add() {
    setError(null);
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    startTransition(async () => {
      const res = await createConsultant({ name: trimmed });
      if (res.error || !res.data) {
        setError(res.error ?? "Failed to add consultant.");
        return;
      }
      setConsultants((prev) => [...prev, res.data!].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
    });
  }

  function saveEdit(id: string) {
    setError(null);
    const trimmed = editingName.trim();
    if (trimmed.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    startTransition(async () => {
      const res = await updateConsultant(id, { name: trimmed });
      if (res.error || !res.data) {
        setError(res.error ?? "Failed to update consultant.");
        return;
      }
      setConsultants((prev) =>
        prev.map((c) => (c.id === id ? res.data! : c)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
      setEditingName("");
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteConsultant(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setConsultants((prev) => prev.filter((c) => c.id !== id));
    });
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-surface-muted">
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4 text-text-secondary" aria-hidden />
          <h3 className="text-sm font-semibold text-text-primary">Consultants</h3>
        </div>
        <p className="text-xs text-text-secondary mt-0.5">
          Manage the consultants who can be assigned to treatments for revenue distribution.
        </p>
      </div>

      <div className="px-6 py-5 space-y-4">
        {error && (
          <div role="alert" className="rounded-lg bg-danger-bg border border-danger-border px-4 py-3 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Consultant Name" htmlFor="consultant-name">
              <Input
                id="consultant-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dr. Anita Rao"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
              />
            </Field>
          </div>
          <Button type="button" size="sm" onClick={add} isLoading={isPending} disabled={isPending}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add
          </Button>
        </div>

        {consultants.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" aria-hidden />}
            title="No consultants yet"
            description="Add a consultant to allocate treatment revenue."
          />
        ) : (
          <div className="divide-y divide-surface-muted border border-surface-muted rounded-lg">
            {consultants.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                {editingId === c.id ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="flex-1"
                      autoFocus
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => saveEdit(c.id)}
                        className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-success hover:bg-success-bg"
                        aria-label="Save"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditingName("");
                        }}
                        className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-surface-muted"
                        aria-label="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-text-primary">{c.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditingName(c.name);
                        }}
                        className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-text-body hover:bg-surface-muted"
                        aria-label={`Edit ${c.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-danger hover:bg-danger-bg"
                        aria-label={`Delete ${c.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Consultancy Schedule
// =============================================================================

function ConsultancyScheduleSection({ initial }: { initial: ConsultancySchedule[] }) {
  const [schedules, setSchedules] = useState<ConsultancySchedule[]>(initial);
  const [date, setDate] = useState("");
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState("17:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add() {
    setError(null);
    if (!date) {
      setError("Select a date.");
      return;
    }
    startTransition(async () => {
      const res = await createConsultancySchedule({
        date,
        start_time: start,
        end_time: end,
        reason: reason.trim() || undefined,
      });
      if (res.error || !res.data) {
        setError(res.error ?? "Failed to add schedule.");
        return;
      }
      setSchedules((prev) =>
        [...prev, res.data!].sort(
          (a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)
        )
      );
      setDate("");
      setReason("");
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteConsultancySchedule(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    });
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-surface-muted">
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-text-secondary" aria-hidden />
          <h3 className="text-sm font-semibold text-text-primary">External Consultancy Schedule</h3>
        </div>
        <p className="text-xs text-text-secondary mt-0.5">
          Block a specific date and time range when you consult elsewhere. Those slots are removed from appointment booking.
        </p>
      </div>

      <div className="px-6 py-5 space-y-4">
        {error && (
          <div role="alert" className="rounded-lg bg-danger-bg border border-danger-border px-4 py-3 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Field label="Date" htmlFor="cs-date">
            <CalendarPicker id="cs-date" value={date} onChange={setDate} placeholder="Select date" clearable />
          </Field>
          <Field label="Start" htmlFor="cs-start">
            <Input id="cs-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="End" htmlFor="cs-end">
            <Input id="cs-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="Reason" htmlFor="cs-reason">
            <Input
              id="cs-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>

        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={add} isLoading={isPending} disabled={isPending}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add Schedule
          </Button>
        </div>

        {schedules.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-5 w-5" aria-hidden />}
            title="No consultancy blocks"
            description="Add a weekly block to reserve time for external consultancy."
          />
        ) : (
          <div className="divide-y divide-surface-muted border border-surface-muted rounded-lg">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="text-sm text-text-primary">
                  <span className="font-medium">{formatDate(s.date)}</span>
                  <span className="text-text-secondary">
                    {" "}
                    · {timeLabel(s.start_time)} – {timeLabel(s.end_time)}
                    {s.reason ? ` · ${s.reason}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-danger hover:bg-danger-bg"
                  aria-label="Delete schedule"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Unavailable Dates (Holidays)
// =============================================================================

function UnavailableDatesSection({ initial }: { initial: UnavailableDate[] }) {
  const [dates, setDates] = useState<UnavailableDate[]>(initial);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add() {
    setError(null);
    if (!date) {
      setError("Select a date.");
      return;
    }
    startTransition(async () => {
      const res = await createUnavailableDate({ date, reason: reason.trim() || undefined });
      if (res.error || !res.data) {
        setError(res.error ?? "Failed to add date.");
        return;
      }
      setDates((prev) => [...prev, res.data!].sort((a, b) => a.date.localeCompare(b.date)));
      setDate("");
      setReason("");
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteUnavailableDate(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setDates((prev) => prev.filter((d) => d.id !== id));
    });
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-surface-muted">
        <div className="flex items-center gap-1.5">
          <CalendarOff className="h-4 w-4 text-text-secondary" aria-hidden />
          <h3 className="text-sm font-semibold text-text-primary">Unavailable Days</h3>
        </div>
        <p className="text-xs text-text-secondary mt-0.5">
          Mark full-day closures or holidays. No appointments can be booked on these dates.
        </p>
      </div>

      <div className="px-6 py-5 space-y-4">
        {error && (
          <div role="alert" className="rounded-lg bg-danger-bg border border-danger-border px-4 py-3 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <Field label="Date" htmlFor="ud-date">
            <CalendarPicker id="ud-date" value={date} onChange={setDate} placeholder="Select date" clearable />
          </Field>
          <Field label="Reason" htmlFor="ud-reason">
            <Input
              id="ud-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Clinic Closed"
            />
          </Field>
          <Button type="button" size="sm" onClick={add} isLoading={isPending} disabled={isPending}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add
          </Button>
        </div>

        {dates.length === 0 ? (
          <EmptyState
            icon={<CalendarOff className="h-5 w-5" aria-hidden />}
            title="No unavailable days"
            description="Add dates when the clinic is closed."
          />
        ) : (
          <div className="divide-y divide-surface-muted border border-surface-muted rounded-lg">
            {dates.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="text-sm text-text-primary">
                  <span className="font-medium">{formatDate(d.date)}</span>
                  {d.reason ? <span className="text-text-secondary"> · {d.reason}</span> : null}
                </div>
                <button
                  type="button"
                  onClick={() => remove(d.id)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-danger hover:bg-danger-bg"
                  aria-label="Delete date"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
