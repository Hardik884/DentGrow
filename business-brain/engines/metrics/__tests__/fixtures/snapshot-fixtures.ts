/**
 * Metrics Engine test fixtures.
 *
 * Builders for ClinicDataSnapshot and its parts. Every builder takes partial
 * overrides so a test states only the field it is about, which keeps the
 * assertions readable and stops unrelated fields from silently mattering.
 *
 * All times are explicit. The engine must never read the clock, so `asOf` is
 * always supplied by the fixture and never defaulted to "now".
 */

import type {
  AppointmentSnapshot,
  ClinicDataSnapshot,
  FollowUpSnapshot,
  PatientSnapshot,
  PaymentSnapshot,
  QueueEntrySnapshot,
  TreatmentSnapshot,
} from "../../../../repositories";

export const CLINIC = "clinic_test";
export const DATE = "2026-07-28";
/** Midday on DATE — a fixed capture moment for time-based calculations. */
export const AS_OF = "2026-07-28T12:00:00.000Z";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

export function appointment(over: Partial<AppointmentSnapshot> = {}): AppointmentSnapshot {
  return {
    id: nextId("appt"),
    patientId: nextId("pat"),
    status: "scheduled",
    scheduledAt: `${DATE}T10:00:00.000Z`,
    durationMinutes: 30,
    source: "walk_in",
    ...over,
  };
}

export function patient(over: Partial<PatientSnapshot> = {}): PatientSnapshot {
  return {
    id: nextId("pat"),
    createdAt: `${DATE}T09:00:00.000Z`,
    ...over,
  };
}

export function payment(over: Partial<PaymentSnapshot> = {}): PaymentSnapshot {
  return {
    id: nextId("pay"),
    amount: 1000,
    paymentDate: DATE,
    ...over,
  };
}

export function treatment(over: Partial<TreatmentSnapshot> = {}): TreatmentSnapshot {
  const cost = over.cost ?? 1000;
  return {
    id: nextId("tx"),
    cost,
    // Default: no consultant, so the clinic retains the whole gross amount.
    clinicShare: cost,
    status: "completed",
    performedAt: `${DATE}T10:30:00.000Z`,
    isScheduled: false,
    ...over,
  };
}

export function queueEntry(over: Partial<QueueEntrySnapshot> = {}): QueueEntrySnapshot {
  return {
    id: nextId("q"),
    status: "waiting",
    checkedInAt: `${DATE}T11:30:00.000Z`,
    startedAt: null,
    ...over,
  };
}

export function followUp(over: Partial<FollowUpSnapshot> = {}): FollowUpSnapshot {
  return {
    id: nextId("fu"),
    dueDate: DATE,
    status: "pending",
    ...over,
  };
}

/** An empty clinic day — every collection present but empty. */
export function snapshot(over: Partial<ClinicDataSnapshot> = {}): ClinicDataSnapshot {
  return {
    clinicId: CLINIC,
    date: DATE,
    asOf: AS_OF,
    appointmentsToday: [],
    patientsRegisteredToday: [],
    patientsSeenToday: [],
    treatments: [],
    payments: [],
    queueToday: [],
    followUps: [],
    capacity: { totalSlotsToday: 0 },
    ...over,
  };
}

/**
 * Run a calculator and return its numeric value.
 *
 * Throws if the calculator withheld the metric (returned null) — a value
 * assertion that silently received `undefined` would pass for the wrong reason.
 * Use {@link isWithheld} to assert withholding explicitly.
 */
export function valueOf(
  calc: (s: ClinicDataSnapshot) => { value: number } | null,
  s: ClinicDataSnapshot,
): number {
  const metric = calc(s);
  if (metric === null) {
    throw new Error("calculator withheld the metric; expected a value");
  }
  return metric.value;
}

/** True when the calculator declined to measure from this snapshot. */
export function isWithheld(
  calc: (s: ClinicDataSnapshot) => unknown | null,
  s: ClinicDataSnapshot,
): boolean {
  return calc(s) === null;
}
