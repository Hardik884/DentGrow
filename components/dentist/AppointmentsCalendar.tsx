"use client";

/**
 * AppointmentsCalendar
 *
 * Month calendar view for the Appointments page. Reuses the existing
 * `getAppointments` server action (via TanStack Query, keyed by the month
 * range) so it shares the same cache as the list view and never duplicates
 * data-fetching logic.
 *
 * - Monthly grid with per-day appointment indicators.
 * - Click a day → the day's appointments render in the side panel.
 * - Click an appointment → the Patient Visit opens inline in a dialog.
 * - Matches the existing black/white minimalist theme (mirrors CalendarPicker).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { getAppointments } from "@/actions/appointments";
import { queryKeys } from "@/lib/query/keys";
import { cn, APPOINTMENT_SOURCE_LABELS } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AppointmentStatusBadge } from "@/components/shared/AppointmentStatusBadge";
import type { AppointmentStatus, AppointmentWithPatient } from "@/types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface AppointmentsCalendarProps {
  clinicTimezone: string;
  clinicToday: string; // YYYY-MM-DD
}

function iso(year: number, month: number, day: number): string {
  return [year, String(month + 1).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

export function AppointmentsCalendar({ clinicTimezone, clinicToday }: AppointmentsCalendarProps) {
  const base = new Date(`${clinicToday}T12:00:00`);
  const [viewYear, setViewYear] = useState(base.getFullYear());
  const [viewMonth, setViewMonth] = useState(base.getMonth());
  const [selectedDay, setSelectedDay] = useState<string>(clinicToday);
  const [activeAppt, setActiveAppt] = useState<AppointmentWithPatient | null>(null);

  const monthStart = iso(viewYear, viewMonth, 1);
  const monthEnd = iso(viewYear, viewMonth, new Date(viewYear, viewMonth + 1, 0).getDate());

  const { data, isPending } = useQuery({
    queryKey: queryKeys.appointments.list({
      page: 1,
      dateFrom: monthStart,
      dateTo: monthEnd,
      // distinguish the calendar's wide fetch from the list's paged fetch
      status: "",
      search: "calendar-month",
    }),
    queryFn: async () => {
      const res = await getAppointments({ dateFrom: monthStart, dateTo: monthEnd, page: 1, limit: 100 });
      if (res.error) throw new Error(res.error);
      return res.data ?? { appointments: [], total: 0 };
    },
    placeholderData: keepPreviousData,
  });

  const appointments = useMemo(() => data?.appointments ?? [], [data]);

  // Group appointments by their clinic-local date.
  const byDate = useMemo(() => {
    const map = new Map<string, AppointmentWithPatient[]>();
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: clinicTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    for (const appt of appointments) {
      const key = fmt.format(new Date(appt.scheduled_at));
      const list = map.get(key) ?? [];
      list.push(appt);
      map.set(key, list);
    }
    return map;
  }, [appointments, clinicTimezone]);

  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: clinicTimezone,
        hour: "2-digit",
        minute: "2-digit",
      }),
    [clinicTimezone]
  );

  // Build the grid cells (Monday-first).
  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(iso(viewYear, viewMonth, d));
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  const selectedList = byDate.get(selectedDay) ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Calendar grid */}
      <div className="lg:col-span-2 bg-white border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={prevMonth}
            className="h-8 w-8 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-text-primary">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="h-8 w-8 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {DAY_HEADERS.map((h) => (
            <div key={h} className="h-7 flex items-center justify-center text-[10px] font-medium text-text-disabled uppercase">
              {h}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((dateStr, idx) => {
            if (!dateStr) return <div key={`blank-${idx}`} className="min-h-16" />;
            const day = Number(dateStr.slice(8, 10));
            const dayAppts = byDate.get(dateStr) ?? [];
            const isToday = dateStr === clinicToday;
            const isSelected = dateStr === selectedDay;
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => setSelectedDay(dateStr)}
                className={cn(
                  "min-h-16 rounded-lg border p-1.5 text-left transition-colors flex flex-col gap-1",
                  isSelected
                    ? "border-accent bg-surface"
                    : "border-border hover:border-border-strong hover:bg-surface"
                )}
              >
                <span
                  className={cn(
                    "text-xs font-medium",
                    isToday ? "text-accent font-bold" : "text-text-primary"
                  )}
                >
                  {day}
                </span>
                {dayAppts.length > 0 && (
                  <span className="inline-flex items-center gap-1 mt-auto">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                    <span className="text-[10px] text-text-secondary">
                      {dayAppts.length}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {isPending && (
          <p className="text-xs text-text-secondary mt-3">Loading appointments…</p>
        )}
      </div>

      {/* Day panel */}
      <div className="bg-white border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3">
          {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </h3>

        {selectedList.length === 0 ? (
          <p className="text-sm text-text-secondary">No appointments this day.</p>
        ) : (
          <ul className="space-y-2">
            {selectedList
              .slice()
              .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
              .map((appt) => (
                <li key={appt.id}>
                  <button
                    type="button"
                    onClick={() => setActiveAppt(appt)}
                    className="w-full text-left rounded-lg border border-border p-2.5 hover:bg-surface hover:border-border-strong transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {appt.patient?.name ?? "Patient"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-text-secondary shrink-0">
                        <Clock className="h-3 w-3" aria-hidden />
                        {timeFmt.format(new Date(appt.scheduled_at))}
                      </span>
                    </div>
                    <div className="mt-1">
                      <AppointmentStatusBadge status={appt.status as AppointmentStatus} />
                    </div>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>

      {/* Inline Patient Visit */}
      <Dialog
        open={!!activeAppt}
        onClose={() => setActiveAppt(null)}
        title="Patient Visit"
      >
        {activeAppt && (
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-text-primary">
                  {activeAppt.patient?.name ?? "Patient"}
                </p>
                {activeAppt.patient?.phone && (
                  <p className="text-sm text-text-secondary">{activeAppt.patient.phone}</p>
                )}
              </div>
              <AppointmentStatusBadge status={activeAppt.status as AppointmentStatus} />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
              <Detail
                label="Date & Time"
                value={new Date(activeAppt.scheduled_at).toLocaleString("en-GB", {
                  timeZone: clinicTimezone,
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              />
              <Detail
                label="Source"
                value={APPOINTMENT_SOURCE_LABELS[activeAppt.source] ?? activeAppt.source}
              />
            </div>

            {activeAppt.notes && (
              <div className="pt-4 border-t border-border">
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-text-primary whitespace-pre-wrap">{activeAppt.notes}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setActiveAppt(null)}>
                Close
              </Button>
              <Link href={`/dentist/appointments/${activeAppt.id}`}>
                <Button size="sm">Open Full Visit</Button>
              </Link>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-text-primary mt-0.5">{value}</p>
    </div>
  );
}
