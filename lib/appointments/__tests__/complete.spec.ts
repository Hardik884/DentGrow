/**
 * Integration specs for completeAppointmentCascade's follow-up auto-completion
 * (step 6 in the function's header doc).
 *
 * Reported issue: follow-ups and the appointments that fulfil them behaved
 * independently — completing the resulting appointment never closed the loop
 * on the follow-up that produced it, so the clinic had to remember to
 * complete the follow-up by hand every time.
 *
 * completeAppointmentCascade takes its `db` client as a parameter, so unlike
 * the "use server" actions this file CAN be invoked directly in a test. Its
 * one indirect dependency, writeAppointmentHistory(), builds its own client
 * from process.env.NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY rather
 * than accepting one — those are deliberately pointed at the local stack here,
 * scoped to this file only, so nothing in this suite can ever reach the
 * project's real (production) Supabase credentials in .env.
 */

const LOCAL_URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:55321";
const LOCAL_KEY =
  process.env.SUPABASE_TEST_SERVICE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
// writeAppointmentHistory() reads these lazily at call time, so setting them
// before import (and only to the local stack) is sufficient and safe.
process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_KEY;

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database.types";
import { completeAppointmentCascade } from "@/lib/appointments/complete";

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
    `\n[complete] SKIPPED — local Supabase not reachable at ${LOCAL_URL}.` +
      `\n           Start it with: npm run db:start\n`,
  );
}

const db: SupabaseClient<Database> = createClient<Database>(LOCAL_URL, LOCAL_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
/* eslint-disable @typescript-eslint/no-explicit-any */
const raw = db as any;

const CLINIC = "9fd00000-0000-4000-8000-000000000003";
const PATIENT = "9fd00000-0000-4000-8000-000000000023";
const DENTIST = "9fd00000-0000-4000-8000-000000000033";

async function insert(table: string, values: unknown) {
  const { error } = await raw.from(table).insert(values);
  if (error) throw new Error(`seed ${table}: ${error.message}`);
}

async function cleanup() {
  await raw.from("clinics").delete().eq("id", CLINIC);
  await raw.auth.admin.deleteUser(DENTIST).catch(() => undefined);
}

let nextSlotHour = 9;

async function makeAppointment(id: string, opts: { followUpId?: string | null } = {}) {
  // Distinct scheduled_at per appointment — uq_appointments_dentist_slot forbids
  // double-booking the same dentist at the same time.
  const hour = String(nextSlotHour++).padStart(2, "0");
  await insert("appointments", {
    id,
    clinic_id: CLINIC,
    patient_id: PATIENT,
    dentist_id: DENTIST,
    scheduled_at: `2026-08-01T${hour}:00:00Z`,
    source: "walk_in",
    status: "scheduled",
    follow_up_id: opts.followUpId ?? null,
  });
}

async function makeFollowUp(id: string, status: "pending" | "completed" | "cancelled") {
  await insert("follow_ups", {
    id,
    clinic_id: CLINIC,
    patient_id: PATIENT,
    follow_up_type: "recall",
    due_date: "2026-08-01",
    status,
  });
}

async function followUpStatus(id: string): Promise<string> {
  const { data, error } = await raw.from("follow_ups").select("status").eq("id", id).single();
  if (error) throw new Error(error.message);
  return (data as { status: string }).status;
}

describe.skipIf(!LOCAL_UP)("completeAppointmentCascade — follow-up auto-completion", () => {
  beforeAll(async () => {
    await cleanup();
    const { error } = await raw.auth.admin.createUser({
      id: DENTIST,
      email: "complete-cascade@test.local",
      password: "password123",
      email_confirm: true,
    });
    if (error && !/already/i.test(error.message)) throw new Error(`seed user: ${error.message}`);

    await insert("clinics", { id: CLINIC, name: "Complete Cascade Test Clinic" });
    await insert("profiles", {
      id: DENTIST,
      clinic_id: CLINIC,
      full_name: "Dr. Cascade",
      role: "dentist",
    });
    await insert("patients", {
      id: PATIENT,
      clinic_id: CLINIC,
      name: "Cascade Test Patient",
    });
  });
  afterAll(cleanup);

  it("completes the linked pending follow-up when its resulting appointment completes", async () => {
    const apptId = "9fd00000-0000-4000-8000-000000000301";
    const followUpId = "9fd00000-0000-4000-8000-000000000401";
    await makeFollowUp(followUpId, "pending");
    await makeAppointment(apptId, { followUpId });

    const result = await completeAppointmentCascade(db, {
      appointmentId: apptId,
      clinicId: CLINIC,
      performedBy: null,
    });

    expect(result.completed).toBe(true);
    expect(await followUpStatus(followUpId)).toBe("completed");
  });

  it("does not touch a follow-up already cancelled independently", async () => {
    const apptId = "9fd00000-0000-4000-8000-000000000302";
    const followUpId = "9fd00000-0000-4000-8000-000000000402";
    await makeFollowUp(followUpId, "cancelled");
    await makeAppointment(apptId, { followUpId });

    await completeAppointmentCascade(db, {
      appointmentId: apptId,
      clinicId: CLINIC,
      performedBy: null,
    });

    // Must stay cancelled — completion never resurrects a deliberate cancellation.
    expect(await followUpStatus(followUpId)).toBe("cancelled");
  });

  it("is idempotent — completing an already-completed appointment again is a no-op", async () => {
    const apptId = "9fd00000-0000-4000-8000-000000000303";
    const followUpId = "9fd00000-0000-4000-8000-000000000403";
    await makeFollowUp(followUpId, "pending");
    await makeAppointment(apptId, { followUpId });

    const first = await completeAppointmentCascade(db, {
      appointmentId: apptId,
      clinicId: CLINIC,
      performedBy: null,
    });
    const second = await completeAppointmentCascade(db, {
      appointmentId: apptId,
      clinicId: CLINIC,
      performedBy: null,
    });

    expect(first.completed).toBe(true);
    expect(second.completed).toBe(false);
    expect(second.alreadyCompleted).toBe(true);
    expect(await followUpStatus(followUpId)).toBe("completed");
  });

  it("does not affect an appointment with no linked follow-up", async () => {
    const apptId = "9fd00000-0000-4000-8000-000000000304";
    await makeAppointment(apptId, { followUpId: null });

    const result = await completeAppointmentCascade(db, {
      appointmentId: apptId,
      clinicId: CLINIC,
      performedBy: null,
    });

    expect(result.completed).toBe(true);
  });
});
