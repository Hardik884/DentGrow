/**
 * Integration specs for the billing SELECTs behind the outstanding balance.
 *
 * The pure formula is covered by lib/billing/__tests__/{opd,xray}.spec.ts.
 * What those cannot catch is the failure mode that actually shipped: the
 * balance helpers were correct for whatever they were handed, and the query
 * feeding them simply never asked Postgres for the X-ray columns. A column name
 * in a PostgREST select string is an untyped string — `tsc` and `next build`
 * both pass whether or not it exists.
 *
 * So these run the real column lists against the real schema and assert the
 * values arrive, then check the balance computed from them end to end.
 *
 * Skips loudly when the local stack is down, same contract as the sibling specs.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database.types";
import { computeOutstandingBalance, treatmentTotalCharge } from "@/lib/billing/balance";

const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
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
    `\n[billing-charges] SKIPPED — local Supabase not reachable at ${URL}.` +
      `\n                  Start it with: npm run db:start\n`,
  );
}

const db: SupabaseClient<Database> = createClient<Database>(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
/* eslint-disable @typescript-eslint/no-explicit-any */
const raw = db as any;

const CLINIC = "9fd00000-0000-4000-8000-000000000006";
const PATIENT = "9fd00000-0000-4000-8000-000000000026";
const DENTIST = "9fd00000-0000-4000-8000-000000000036";
const APPT = "9fd00000-0000-4000-8000-000000000601";
const TREATMENT = "9fd00000-0000-4000-8000-000000000701";

/** The exact column list the balance actions use. */
const BALANCE_COLUMNS = "cost, opd_charged, opd_fee, xray_taken, xray_cost, status";

async function insert(table: string, values: unknown) {
  const { error } = await raw.from(table).insert(values);
  if (error) throw new Error(`seed ${table}: ${error.message}`);
}

async function cleanup() {
  await raw.from("clinics").delete().eq("id", CLINIC);
  await raw.auth.admin.deleteUser(DENTIST).catch(() => undefined);
}

describe.skipIf(!LOCAL_UP)("billing charge SELECTs (integration)", () => {
  beforeAll(async () => {
    await cleanup();
    const { error } = await raw.auth.admin.createUser({
      id: DENTIST,
      email: "billing-charges@test.local",
      password: "password123",
      email_confirm: true,
    });
    if (error && !/already/i.test(error.message)) throw new Error(`seed user: ${error.message}`);

    await insert("clinics", { id: CLINIC, name: "Billing Charges Test Clinic" });
    await insert("clinic_settings", {
      clinic_id: CLINIC,
      clinic_name: "Billing Charges Test Clinic",
    });
    await insert("profiles", {
      id: DENTIST,
      clinic_id: CLINIC,
      full_name: "Dr. Billing",
      role: "dentist",
    });
    await insert("patients", { id: PATIENT, clinic_id: CLINIC, name: "Billing Test Patient" });
    await insert("appointments", {
      id: APPT,
      clinic_id: CLINIC,
      patient_id: PATIENT,
      dentist_id: DENTIST,
      scheduled_at: "2026-08-01T09:00:00Z",
      source: "walk_in",
      status: "completed",
    });
    // The clinic's reported visit: a ₹600 treatment with a ₹400 radiograph.
    await insert("treatments", {
      id: TREATMENT,
      clinic_id: CLINIC,
      patient_id: PATIENT,
      appointment_id: APPT,
      treatment_type: "Filling",
      cost: 600,
      status: "completed",
      xray_taken: true,
      xray_cost: 400,
    });
  });
  afterAll(cleanup);

  it("returns the X-ray columns the balance formula needs", async () => {
    // Guards the actual defect: a select that silently omits these columns
    // makes xrayChargeFor() see undefined and charge nothing.
    const { data, error } = await raw
      .from("treatments")
      .select(BALANCE_COLUMNS)
      .eq("id", TREATMENT)
      .single();

    expect(error).toBeNull();
    expect(data.xray_taken).toBe(true);
    expect(Number(data.xray_cost)).toBe(400);
  });

  it("computes the reported case correctly from real rows", async () => {
    const { data: treatments } = await raw
      .from("treatments")
      .select(BALANCE_COLUMNS)
      .eq("patient_id", PATIENT)
      .is("deleted_at", null);
    const { data: payments } = await raw
      .from("payments")
      .select("amount")
      .eq("patient_id", PATIENT)
      .is("deleted_at", null);

    // ₹600 + ₹400. This read ₹600 before the fix.
    expect(computeOutstandingBalance(treatments ?? [], payments ?? [])).toBe(1000);
  });

  it("keeps the per-visit charge and the patient balance in agreement", async () => {
    const { data: treatments } = await raw
      .from("treatments")
      .select(BALANCE_COLUMNS)
      .eq("appointment_id", APPT)
      .is("deleted_at", null);

    const visitCharge = (treatments ?? []).reduce(
      (sum: number, t: Record<string, unknown>) => sum + treatmentTotalCharge(t),
      0,
    );
    expect(visitCharge).toBe(1000);
  });

  it("accepts the wider column list used by the outstanding-patients list", async () => {
    const { error } = await raw
      .from("treatments")
      .select("patient_id, cost, opd_charged, opd_fee, xray_taken, xray_cost, status")
      .eq("clinic_id", CLINIC);
    expect(error).toBeNull();
  });

  it("accepts the column list used by the per-appointment payment status map", async () => {
    const { error } = await raw
      .from("treatments")
      .select("appointment_id, cost, opd_charged, opd_fee, xray_taken, xray_cost, status")
      .eq("clinic_id", CLINIC);
    expect(error).toBeNull();
  });

  it("accepts the receptionist treatment column list", async () => {
    // Receptionists drive the payment screens, so their rows must carry the
    // billing columns too — omitting them made their totals disagree.
    const { data, error } = await raw
      .from("treatments")
      .select(
        "id, clinic_id, appointment_id, patient_id, treatment_type, patient_visible_notes, " +
          "cost, opd_charged, opd_fee, xray_taken, xray_cost, status, performed_at, " +
          "deleted_at, created_at, updated_at",
      )
      .eq("id", TREATMENT)
      .single();

    expect(error).toBeNull();
    expect(Number(data.xray_cost)).toBe(400);
  });

  it("accepts the analytics payout column list", async () => {
    const { error } = await raw
      .from("treatments")
      .select(
        "id, cost, clinic_share, consultant_share, consultant_id, patient_id, status, " +
          "opd_charged, opd_fee, xray_taken, xray_cost, performed_at, created_at",
      )
      .eq("clinic_id", CLINIC);
    expect(error).toBeNull();
  });

  it("accepts the unbounded payments list the payout allocator needs", async () => {
    const { error } = await raw
      .from("payments")
      .select("amount, treatment_id, payment_date")
      .eq("clinic_id", CLINIC)
      .is("deleted_at", null);
    expect(error).toBeNull();
  });
});
