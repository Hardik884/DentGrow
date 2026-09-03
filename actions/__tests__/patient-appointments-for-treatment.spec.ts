/**
 * Integration spec for the query behind the "Add Treatment" appointment
 * picker (components/dentist/TreatmentForm.tsx, via
 * actions/follow-ups.ts#getPatientAppointmentsForFollowUp, reused as the data
 * source for both features rather than duplicated).
 *
 * Same constraint as actions/__tests__/follow-up-overdue.spec.ts: the action
 * itself resolves its session from request cookies and can't be invoked
 * outside a real Next.js request, so this exercises the identical query
 * directly against Postgres — same filter, same ordering, same limit — to
 * confirm patients see the appointments they expect to pick from and only
 * those.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database.types";

const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:55321";
const KEY =
  process.env.SUPABASE_TEST_SERVICE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${URL}/rest/v1/`, {
      headers: { apikey: KEY },
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
    `\n[patient-appointments-for-treatment] SKIPPED — local Supabase not reachable at ${URL}.` +
      `\n                    Start it with: npm run db:start\n`,
  );
}

const db: SupabaseClient<Database> = createClient<Database>(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
/* eslint-disable @typescript-eslint/no-explicit-any */
const raw = db as any;

const CLINIC = "9fd00000-0000-4000-8000-000000000002";
const PATIENT = "9fd00000-0000-4000-8000-000000000022";
const DENTIST = "9fd00000-0000-4000-8000-000000000032";

async function insert(table: string, values: unknown) {
  const { error } = await raw.from(table).insert(values);
  if (error) throw new Error(`seed ${table}: ${error.message}`);
}

async function cleanup() {
  await raw.from("clinics").delete().eq("id", CLINIC);
  await raw.auth.admin.deleteUser(DENTIST).catch(() => undefined);
}

/** Mirrors getPatientAppointmentsForFollowUp's query exactly. */
async function fetchEligibleAppointments() {
  const { data, error } = await raw
    .from("appointments")
    .select("id, scheduled_at, status")
    .eq("patient_id", PATIENT)
    .eq("clinic_id", CLINIC)
    .is("deleted_at", null)
    .not("status", "in", '("cancelled","no_show")')
    .order("scheduled_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data as Array<{ id: string; scheduled_at: string; status: string }>;
}

describe.skipIf(!LOCAL_UP)("appointment picker query (Add Treatment)", () => {
  const scheduledId = "9fd00000-0000-4000-8000-000000000201";
  const completedId = "9fd00000-0000-4000-8000-000000000202";
  const cancelledId = "9fd00000-0000-4000-8000-000000000203";
  const noShowId = "9fd00000-0000-4000-8000-000000000204";

  beforeAll(async () => {
    await cleanup();
    const { error } = await raw.auth.admin.createUser({
      id: DENTIST,
      email: "treatment-picker@test.local",
      password: "password123",
      email_confirm: true,
    });
    if (error && !/already/i.test(error.message)) throw new Error(`seed user: ${error.message}`);

    await insert("clinics", { id: CLINIC, name: "Treatment Picker Test Clinic" });
    await insert("profiles", {
      id: DENTIST,
      clinic_id: CLINIC,
      full_name: "Dr. Test",
      role: "dentist",
    });
    await insert("patients", {
      id: PATIENT,
      clinic_id: CLINIC,
      name: "Treatment Picker Test Patient",
    });
    await insert("appointments", {
      id: scheduledId,
      clinic_id: CLINIC,
      patient_id: PATIENT,
      dentist_id: DENTIST,
      scheduled_at: "2026-08-01T09:00:00Z",
      source: "walk_in",
      status: "scheduled",
    });
    await insert("appointments", {
      id: completedId,
      clinic_id: CLINIC,
      patient_id: PATIENT,
      dentist_id: DENTIST,
      scheduled_at: "2026-08-02T09:00:00Z",
      source: "walk_in",
      status: "completed",
    });
    await insert("appointments", {
      id: cancelledId,
      clinic_id: CLINIC,
      patient_id: PATIENT,
      dentist_id: DENTIST,
      scheduled_at: "2026-08-03T09:00:00Z",
      source: "walk_in",
      status: "cancelled",
    });
    await insert("appointments", {
      id: noShowId,
      clinic_id: CLINIC,
      patient_id: PATIENT,
      dentist_id: DENTIST,
      scheduled_at: "2026-08-04T09:00:00Z",
      source: "walk_in",
      status: "no_show",
    });
  });
  afterAll(cleanup);

  it("includes scheduled and completed appointments", async () => {
    const rows = await fetchEligibleAppointments();
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(scheduledId);
    expect(ids).toContain(completedId);
  });

  it("excludes cancelled and no_show appointments", async () => {
    const rows = await fetchEligibleAppointments();
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(cancelledId);
    expect(ids).not.toContain(noShowId);
  });

  it("orders most-recent-first", async () => {
    const rows = await fetchEligibleAppointments();
    const ids = rows.map((r) => r.id);
    expect(ids.indexOf(completedId)).toBeLessThan(ids.indexOf(scheduledId));
  });
});
