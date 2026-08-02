/**
 * Integration specs for automatic no-show detection
 * (lib/appointments/auto-no-show.ts).
 *
 * Business rule under test: once an appointment's OWN calendar day has fully
 * ended in the clinic's timezone, a `scheduled` appointment (nobody ever
 * checked the patient in) becomes `no_show`. Every other status — checked_in,
 * in_progress, completed, cancelled — must be left exactly as it is, and an
 * appointment whose day has not yet ended must not be touched even if its
 * time slot has already passed.
 *
 * autoMarkNoShowForClinic takes `db` as a parameter, so — like
 * completeAppointmentCascade — it can be invoked directly here. Its one
 * indirect dependency, writeAppointmentHistory(), builds its own client from
 * process.env.NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY; those are
 * pointed at the local stack ONLY, scoped to this file, before anything is
 * imported — see lib/appointments/__tests__/complete.spec.ts for the same
 * pattern and the same reasoning (this project's real .env points at
 * production, so this must never be left to fall through to it).
 */

const LOCAL_URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const LOCAL_KEY =
  process.env.SUPABASE_TEST_SERVICE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_KEY;

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database.types";
import { autoMarkNoShowForClinic } from "@/lib/appointments/auto-no-show";
import { getTodayInTimezone, getUtcBoundariesForLocalDate } from "@/lib/utils";

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_URL}/rest/v1/`, {
      headers: { apikey: LOCAL_KEY },
      signal: AbortSignal.timeout(2500),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}
const LOCAL_UP = await reachable();
if (!LOCAL_UP) {
  console.warn(
    `\n[auto-no-show] SKIPPED — local Supabase not reachable at ${LOCAL_URL}.` +
      `\n                Start it with: npm run db:start\n`,
  );
}

const db: SupabaseClient<Database> = createClient<Database>(LOCAL_URL, LOCAL_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
/* eslint-disable @typescript-eslint/no-explicit-any */
const raw = db as any;

const TZ = "Asia/Kolkata";
const CLINIC = "9fd00000-0000-4000-8000-000000000004";
const PATIENT = "9fd00000-0000-4000-8000-000000000024";
const DENTIST = "9fd00000-0000-4000-8000-000000000034";

async function insert(table: string, values: unknown) {
  const { error } = await raw.from(table).insert(values);
  if (error) throw new Error(`seed ${table}: ${error.message}`);
}

async function cleanup() {
  await raw.from("clinics").delete().eq("id", CLINIC);
  await raw.auth.admin.deleteUser(DENTIST).catch(() => undefined);
}

// Every call site passes its own distinct scheduledAt — uq_appointments_dentist_slot
// forbids double-booking the same dentist at the same instant.
async function makeAppointment(id: string, scheduledAt: string, status: string) {
  await insert("appointments", {
    id,
    clinic_id: CLINIC,
    patient_id: PATIENT,
    dentist_id: DENTIST,
    scheduled_at: scheduledAt,
    source: "walk_in",
    status,
  });
}

async function appointmentStatus(id: string): Promise<string> {
  const { data, error } = await raw.from("appointments").select("status").eq("id", id).single();
  if (error) throw new Error(error.message);
  return (data as { status: string }).status;
}

describe.skipIf(!LOCAL_UP)("autoMarkNoShowForClinic", () => {
  beforeAll(async () => {
    await cleanup();
    const { error } = await raw.auth.admin.createUser({
      id: DENTIST,
      email: "auto-no-show@test.local",
      password: "password123",
      email_confirm: true,
    });
    if (error && !/already/i.test(error.message)) throw new Error(`seed user: ${error.message}`);

    await insert("clinics", { id: CLINIC, name: "Auto No-Show Test Clinic" });
    await insert("clinic_settings", {
      clinic_id: CLINIC,
      clinic_name: "Auto No-Show Test Clinic",
      timezone: TZ,
    });
    await insert("profiles", {
      id: DENTIST,
      clinic_id: CLINIC,
      full_name: "Dr. Auto",
      role: "dentist",
    });
    await insert("patients", {
      id: PATIENT,
      clinic_id: CLINIC,
      name: "Auto No-Show Test Patient",
    });
  });
  afterAll(cleanup);

  // A date safely and permanently in the past relative to "now" in every
  // environment this suite will ever run in. Each test gets its own hour
  // offset from this day — uq_appointments_dentist_slot forbids double-
  // booking the same dentist at the same scheduled_at.
  const PAST_DAY_START = getUtcBoundariesForLocalDate("2020-01-01", TZ).start;
  function pastSlot(hourOffset: number): string {
    return new Date(Date.parse(PAST_DAY_START) + hourOffset * 3_600_000).toISOString();
  }

  it("marks a scheduled appointment as no_show once its day has ended", async () => {
    const id = "9fd00000-0000-4000-8000-000000000501";
    await makeAppointment(id, pastSlot(1), "scheduled");

    const result = await autoMarkNoShowForClinic(db, { clinicId: CLINIC, timezone: TZ });

    expect(result.transitionedIds).toContain(id);
    expect(await appointmentStatus(id)).toBe("no_show");
  });

  it("does not touch a completed appointment from the same past day", async () => {
    const id = "9fd00000-0000-4000-8000-000000000502";
    await makeAppointment(id, pastSlot(2), "completed");

    await autoMarkNoShowForClinic(db, { clinicId: CLINIC, timezone: TZ });

    expect(await appointmentStatus(id)).toBe("completed");
  });

  it("does not touch a checked_in appointment from the same past day", async () => {
    const id = "9fd00000-0000-4000-8000-000000000503";
    await makeAppointment(id, pastSlot(3), "checked_in");

    await autoMarkNoShowForClinic(db, { clinicId: CLINIC, timezone: TZ });

    expect(await appointmentStatus(id)).toBe("checked_in");
  });

  it("does not touch an in_progress appointment from the same past day", async () => {
    const id = "9fd00000-0000-4000-8000-000000000504";
    await makeAppointment(id, pastSlot(4), "in_progress");

    await autoMarkNoShowForClinic(db, { clinicId: CLINIC, timezone: TZ });

    expect(await appointmentStatus(id)).toBe("in_progress");
  });

  it("does not touch an already-cancelled appointment from the same past day", async () => {
    const id = "9fd00000-0000-4000-8000-000000000505";
    await makeAppointment(id, pastSlot(5), "cancelled");

    await autoMarkNoShowForClinic(db, { clinicId: CLINIC, timezone: TZ });

    expect(await appointmentStatus(id)).toBe("cancelled");
  });

  it("does not mark a scheduled appointment whose day has not ended yet", async () => {
    // "Today" for this clinic, scheduled at a time that may already be in the
    // past within today — the rule is end-of-DAY, not end-of-slot.
    const todayLocal = getTodayInTimezone(TZ);
    const todayStart = getUtcBoundariesForLocalDate(todayLocal, TZ).start;
    const scheduledToday = new Date(Date.parse(todayStart) + 1 * 3_600_000).toISOString();
    const id = "9fd00000-0000-4000-8000-000000000506";
    await makeAppointment(id, scheduledToday, "scheduled");

    const result = await autoMarkNoShowForClinic(db, { clinicId: CLINIC, timezone: TZ });

    expect(result.transitionedIds).not.toContain(id);
    expect(await appointmentStatus(id)).toBe("scheduled");
  });

  it("is idempotent — a second run re-selects nothing new", async () => {
    const id = "9fd00000-0000-4000-8000-000000000507";
    await makeAppointment(id, pastSlot(7), "scheduled");

    const first = await autoMarkNoShowForClinic(db, { clinicId: CLINIC, timezone: TZ });
    const second = await autoMarkNoShowForClinic(db, { clinicId: CLINIC, timezone: TZ });

    expect(first.transitionedIds).toContain(id);
    expect(second.transitionedIds).not.toContain(id);
    expect(await appointmentStatus(id)).toBe("no_show");
  });
});
