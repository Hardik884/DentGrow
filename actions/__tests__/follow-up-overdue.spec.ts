/**
 * Integration specs for follow-up overdue classification.
 *
 * Run against the LOCAL Supabase stack and skip, loudly, when it is not
 * reachable — same contract as the sibling business-brain specs.
 *
 * `createFollowUp` itself is a Next.js Server Action (it resolves the session
 * from request cookies via `next/headers`), which only functions inside a real
 * request — there is no precedent in this codebase for invoking one directly
 * from a test, and inventing one is out of scope here. What IS testable
 * against real Postgres, and is the actual thing under review, is the
 * classification itself: given rows shaped exactly as `createFollowUp` would
 * produce them, does "overdue" come out right for every combination the issue
 * named — newly created, back-entered, completed, pending?
 *
 * The four cases below are the four named in the reported issue, plus the
 * clinic-timezone-boundary case that the same review surfaced.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database.types";
import { getTodayInTimezone } from "@/lib/utils";

const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:55321";
const KEY =
  process.env.SUPABASE_TEST_SERVICE_KEY ??
  // Standard local-development service key — published in Supabase's own docs.
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
    `\n[follow-up-overdue] SKIPPED — local Supabase not reachable at ${URL}.` +
      `\n                    Start it with: npm run db:start\n`,
  );
}

const db: SupabaseClient<Database> = createClient<Database>(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
/* eslint-disable @typescript-eslint/no-explicit-any */
const raw = db as any;

const CLINIC = "9fd00000-0000-4000-8000-000000000001";
const TZ = "Asia/Kolkata";
const PATIENT = "9fd00000-0000-4000-8000-000000000021";

async function insert(table: string, values: unknown) {
  const { error } = await raw.from(table).insert(values);
  if (error) throw new Error(`seed ${table}: ${error.message}`);
}

async function cleanup() {
  await raw.from("clinics").delete().eq("id", CLINIC);
}

async function seed() {
  await cleanup();
  await insert("clinics", { id: CLINIC, name: "Overdue Test Clinic" });
  await insert("clinic_settings", {
    clinic_id: CLINIC,
    clinic_name: "Overdue Test Clinic",
    timezone: TZ,
  });
  await insert("patients", {
    id: PATIENT,
    clinic_id: CLINIC,
    name: "Overdue Test Patient",
    created_at: "2026-01-01T00:00:00Z",
  });
}

/** Whether `overdue_follow_ups` (the clinic-timezone-aware view) contains id. */
async function isInOverdueView(id: string): Promise<boolean> {
  const { data, error } = await raw.from("overdue_follow_ups").select("id").eq("id", id);
  if (error) throw new Error(`overdue_follow_ups: ${error.message}`);
  return (data ?? []).some((r: { id: string }) => r.id === id);
}

describe.skipIf(!LOCAL_UP)("follow-up overdue classification (integration)", () => {
  beforeAll(seed);
  afterAll(cleanup);

  const today = getTodayInTimezone(TZ);
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const nextWeek = new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  it("PENDING + past due date IS overdue", async () => {
    const id = "9fd00000-0000-4000-8000-000000000101";
    await insert("follow_ups", {
      id,
      clinic_id: CLINIC,
      patient_id: PATIENT,
      follow_up_type: "recall",
      due_date: yesterday,
      status: "pending",
    });
    expect(await isInOverdueView(id)).toBe(true);
  });

  it("COMPLETED + past due date is NOT overdue — this is the reported bug", async () => {
    // A back-entered historical record: the clinic is digitising a recall that
    // already happened. Before this fix there was no way to create one with
    // any status other than pending, so every such record misreported as
    // overdue regardless of what actually happened.
    const id = "9fd00000-0000-4000-8000-000000000102";
    await insert("follow_ups", {
      id,
      clinic_id: CLINIC,
      patient_id: PATIENT,
      follow_up_type: "recall",
      due_date: yesterday,
      status: "completed",
    });
    expect(await isInOverdueView(id)).toBe(false);
  });

  it("CANCELLED + past due date is NOT overdue", async () => {
    const id = "9fd00000-0000-4000-8000-000000000103";
    await insert("follow_ups", {
      id,
      clinic_id: CLINIC,
      patient_id: PATIENT,
      follow_up_type: "recall",
      due_date: yesterday,
      status: "cancelled",
    });
    expect(await isInOverdueView(id)).toBe(false);
  });

  it("newly created, PENDING, due in the future is NOT overdue", async () => {
    const id = "9fd00000-0000-4000-8000-000000000104";
    await insert("follow_ups", {
      id,
      clinic_id: CLINIC,
      patient_id: PATIENT,
      follow_up_type: "recall",
      due_date: nextWeek,
      status: "pending",
    });
    expect(await isInOverdueView(id)).toBe(false);
  });

  it("PENDING and due exactly today is NOT overdue", async () => {
    // The boundary case: today has not finished, so it must not read as missed.
    const id = "9fd00000-0000-4000-8000-000000000105";
    await insert("follow_ups", {
      id,
      clinic_id: CLINIC,
      patient_id: PATIENT,
      follow_up_type: "recall",
      due_date: today,
      status: "pending",
    });
    expect(await isInOverdueView(id)).toBe(false);
  });
});
