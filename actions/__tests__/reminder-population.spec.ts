/**
 * Integration specs for the WhatsApp reminder population.
 *
 * Runs against the LOCAL Supabase stack and skips, loudly, when it is not
 * reachable — same contract as the sibling specs. Server Actions can't be called
 * directly (they resolve the session from request cookies), so these seed real
 * Postgres rows, run the SAME queries the actions run, and feed the results
 * through the actual pure core (dedupeByPatientId / buildActionable). That covers
 * the two things end-to-end: the SQL filters (clinic, soft-delete, status,
 * future-visit) and the population rules that decide who is messaged.
 *
 * The headline case — the "16 said, 7 shown" bug — is the distinct-patient
 * assertion: several treatment rows for one patient collapse to one reminder,
 * and the count and the list are the same number.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database.types";
import { getTodayInTimezone } from "@/lib/utils";
import {
  buildActionable,
  dedupeByPatientId,
  type Candidate,
} from "@/lib/messaging/reminders-core";

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
    `\n[reminder-population] SKIPPED — local Supabase not reachable at ${URL}.` +
      `\n                      Start it with: npm run db:start\n`,
  );
}

const db: SupabaseClient<Database> = createClient<Database>(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
/* eslint-disable @typescript-eslint/no-explicit-any */
const raw = db as any;

const TZ = "Asia/Kolkata";
const CLINIC_A = "9fd10000-0000-4000-8000-0000000000a1";
const CLINIC_B = "9fd10000-0000-4000-8000-0000000000b1";
const DENTIST_A = "9fd10000-0000-4000-8000-0000000000d1";

// Clinic A patients
const P_MULTI = "9fd10000-0000-4000-8000-000000000101"; // 3 planned treatments, no visit
const P_BOOKED = "9fd10000-0000-4000-8000-000000000102"; // planned + a future visit
const P_DELETED = "9fd10000-0000-4000-8000-000000000103"; // planned but soft-deleted
const P_NOPHONE = "9fd10000-0000-4000-8000-000000000104"; // planned, no phone
const P_OVERDUE = "9fd10000-0000-4000-8000-000000000105"; // 2 overdue follow-ups
// Clinic B patient
const PB = "9fd10000-0000-4000-8000-0000000000f1";

async function insert(table: string, values: unknown) {
  const { error } = await raw.from(table).insert(values);
  if (error) throw new Error(`seed ${table}: ${error.message}`);
}

async function cleanup() {
  await raw.from("clinics").delete().in("id", [CLINIC_A, CLINIC_B]);
  await raw.auth.admin.deleteUser(DENTIST_A).catch(() => {});
}

const today = getTodayInTimezone(TZ);
const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const futureVisit = new Date(Date.now() + 7 * 86_400_000).toISOString();
const pastVisit = new Date(Date.now() - 7 * 86_400_000).toISOString();

/**
 * Create a past appointment (treatments must reference one) and return its id.
 * Each gets a distinct time — the schema forbids one dentist two slots at once.
 */
let apptSeq = 0;
async function pastAppointment(clinicId: string, patientId: string): Promise<string> {
  const seq = apptSeq++;
  const id = `9fd10000-0000-4000-8000-0000009${String(seq).padStart(5, "0")}`;
  await insert("appointments", {
    id,
    clinic_id: clinicId,
    patient_id: patientId,
    dentist_id: DENTIST_A,
    scheduled_at: new Date(Date.parse(pastVisit) - seq * 3_600_000).toISOString(),
    source: "phone_call",
    status: "completed",
  });
  return id;
}

async function seed() {
  await cleanup();

  for (const [id, name] of [
    [CLINIC_A, "Reminder Clinic A"],
    [CLINIC_B, "Reminder Clinic B"],
  ] as const) {
    await insert("clinics", { id, name });
    await insert("clinic_settings", { clinic_id: id, clinic_name: name, timezone: TZ, phone: "02212345678" });
  }

  // A dentist in clinic A, needed as appointments.dentist_id.
  const { error } = await raw.auth.admin.createUser({
    id: DENTIST_A,
    email: `dentist-${DENTIST_A}@example.test`,
    password: "password123",
    email_confirm: true,
  });
  if (error && !/already/i.test(error.message)) throw new Error(`create dentist: ${error.message}`);
  await insert("profiles", { id: DENTIST_A, clinic_id: CLINIC_A, full_name: "Dr A", role: "dentist" });

  const patients = [
    { id: P_MULTI, clinic_id: CLINIC_A, name: "Multi Plan", phone: "9845010001" },
    { id: P_BOOKED, clinic_id: CLINIC_A, name: "Already Booked", phone: "9845010002" },
    { id: P_DELETED, clinic_id: CLINIC_A, name: "Deleted Plan", phone: "9845010003" },
    { id: P_NOPHONE, clinic_id: CLINIC_A, name: "No Phone", phone: null },
    { id: P_OVERDUE, clinic_id: CLINIC_A, name: "Overdue Twice", phone: "9845010005" },
    { id: PB, clinic_id: CLINIC_B, name: "Other Clinic", phone: "9845010009" },
  ];
  for (const p of patients) await insert("patients", p);

  // P_MULTI: three planned treatments (one past appointment) → ONE patient.
  const apptMulti = await pastAppointment(CLINIC_A, P_MULTI);
  for (const type of ["Root canal", "Crown", "Cleaning"]) {
    await insert("treatments", {
      clinic_id: CLINIC_A,
      appointment_id: apptMulti,
      patient_id: P_MULTI,
      treatment_type: type,
      status: "planned",
    });
  }
  // P_BOOKED: planned treatment but also a FUTURE appointment → excluded.
  const apptBookedPast = await pastAppointment(CLINIC_A, P_BOOKED);
  await insert("treatments", { clinic_id: CLINIC_A, appointment_id: apptBookedPast, patient_id: P_BOOKED, treatment_type: "Filling", status: "planned" });
  await insert("appointments", {
    clinic_id: CLINIC_A,
    patient_id: P_BOOKED,
    dentist_id: DENTIST_A,
    scheduled_at: futureVisit,
    source: "phone_call",
    status: "scheduled",
  });
  // P_DELETED: planned but soft-deleted → excluded.
  const apptDeleted = await pastAppointment(CLINIC_A, P_DELETED);
  await insert("treatments", {
    clinic_id: CLINIC_A,
    appointment_id: apptDeleted,
    patient_id: P_DELETED,
    treatment_type: "Extraction",
    status: "planned",
    deleted_at: new Date().toISOString(),
  });
  // P_NOPHONE: planned, no phone → counted in total, not in actionable.
  const apptNoPhone = await pastAppointment(CLINIC_A, P_NOPHONE);
  await insert("treatments", { clinic_id: CLINIC_A, appointment_id: apptNoPhone, patient_id: P_NOPHONE, treatment_type: "Scaling", status: "planned" });
  // Clinic B: planned treatment that must never leak into clinic A.
  const apptB = await pastAppointment(CLINIC_B, PB);
  await insert("treatments", { clinic_id: CLINIC_B, appointment_id: apptB, patient_id: PB, treatment_type: "Whitening", status: "planned" });

  // P_OVERDUE: two overdue pending follow-ups → one reminder.
  for (let i = 0; i < 2; i++) {
    await insert("follow_ups", {
      clinic_id: CLINIC_A,
      patient_id: P_OVERDUE,
      due_date: yesterday,
      status: "pending",
    });
  }
}

// ── The queries the actions run, replicated so the test exercises the same SQL ──

async function plannedNoVisitCandidates(clinicId: string): Promise<Candidate[]> {
  const now = new Date().toISOString();
  const { data: planned } = await raw
    .from("treatments")
    .select("patient_id, treatment_type, created_at, patient:patients(id, name, phone)")
    .eq("clinic_id", clinicId)
    .eq("status", "planned")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const { data: future } = await raw
    .from("appointments")
    .select("patient_id")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .gt("scheduled_at", now)
    .in("status", ["scheduled", "checked_in", "in_progress", "completed"]);
  const hasFuture = new Set((future ?? []).map((a: { patient_id: string }) => a.patient_id));
  type PlannedRow = {
    patient_id: string;
    treatment_type: string;
    patient: { id: string; name: string; phone: string | null } | null;
  };
  const rows = ((planned ?? []) as PlannedRow[]).filter((t) => !hasFuture.has(t.patient_id) && t.patient);
  return dedupeByPatientId(rows, (t) => t.patient_id).map((t) => ({
    patientId: t.patient!.id,
    name: t.patient!.name,
    phone: t.patient!.phone,
    reason: `Planned: ${t.treatment_type}`,
    vars: { patient_name: t.patient!.name },
  }));
}

async function overdueCandidates(clinicId: string): Promise<Candidate[]> {
  const { data } = await raw
    .from("follow_ups")
    .select("due_date, patient:patients(id, name, phone)")
    .eq("clinic_id", clinicId)
    .eq("status", "pending")
    .lt("due_date", today)
    .is("deleted_at", null)
    .order("due_date", { ascending: true });
  type OverdueRow = { due_date: string; patient: { id: string; name: string; phone: string | null } | null };
  const rows = ((data ?? []) as OverdueRow[]).filter((f) => f.patient);
  return dedupeByPatientId(rows, (f) => f.patient?.id).map((f) => ({
    patientId: f.patient!.id,
    name: f.patient!.name,
    phone: f.patient!.phone,
    reason: "Follow-up due",
    vars: { patient_name: f.patient!.name },
  }));
}

async function remindedRecently(clinicId: string, kind: string): Promise<Set<string>> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await raw
    .from("reminder_logs")
    .select("patient_id")
    .eq("clinic_id", clinicId)
    .eq("kind", kind)
    .gte("sent_at", since);
  return new Set((data ?? []).map((l: { patient_id: string }) => l.patient_id));
}

const fill = (vars: Record<string, string>) => `Hi ${vars.patient_name}, a quick note from your clinic.`;

describe.skipIf(!LOCAL_UP)("WhatsApp reminder population (integration)", () => {
  beforeAll(seed);
  afterAll(cleanup);

  it("counts distinct patients, not treatment rows (the 16→7 root cause)", async () => {
    const candidates = await plannedNoVisitCandidates(CLINIC_A);
    // P_MULTI (3 rows) + P_NOPHONE = 2 distinct patients, not 4 rows.
    // P_BOOKED excluded (future visit), P_DELETED excluded (soft-deleted).
    const ids = candidates.map((c) => c.patientId).sort();
    expect(ids).toEqual([P_MULTI, P_NOPHONE].sort());
  });

  it("actionable count equals the send list, dropping the no-phone patient", async () => {
    const candidates = await plannedNoVisitCandidates(CLINIC_A);
    const actionable = buildActionable(candidates, new Set(), fill);
    // total distinct = 2 (P_MULTI, P_NOPHONE); actionable = 1 (P_NOPHONE dropped).
    expect(candidates).toHaveLength(2);
    expect(actionable.map((r) => r.patientId)).toEqual([P_MULTI]);
  });

  it("never mixes clinics", async () => {
    const a = await plannedNoVisitCandidates(CLINIC_A);
    expect(a.some((c) => c.patientId === PB)).toBe(false);
    const b = await plannedNoVisitCandidates(CLINIC_B);
    expect(b.map((c) => c.patientId)).toEqual([PB]);
  });

  it("suppresses a patient already reminded (no duplicate on refresh)", async () => {
    // Record that P_MULTI was messaged for this kind.
    await insert("reminder_logs", {
      clinic_id: CLINIC_A,
      patient_id: P_MULTI,
      kind: "treatment_plan_follow_up",
      sent_by: DENTIST_A,
    });
    const candidates = await plannedNoVisitCandidates(CLINIC_A);
    const reminded = await remindedRecently(CLINIC_A, "treatment_plan_follow_up");
    const actionable = buildActionable(candidates, reminded, fill);
    // P_MULTI now suppressed; P_NOPHONE still has no phone → nobody left.
    expect(actionable).toHaveLength(0);
    // …but the underlying problem is still counted (total unchanged).
    expect(candidates).toHaveLength(2);
    // Clean up so re-runs start fresh.
    await raw.from("reminder_logs").delete().eq("clinic_id", CLINIC_A);
  });

  it("overdue follow-ups: two for one patient collapse to a single reminder", async () => {
    const candidates = await overdueCandidates(CLINIC_A);
    expect(candidates.map((c) => c.patientId)).toEqual([P_OVERDUE]);
    const actionable = buildActionable(candidates, new Set(), fill);
    expect(actionable).toHaveLength(1);
  });
});
