/**
 * Integration specs for SupabaseMetricsDataRepository.
 *
 * These run against the LOCAL Supabase stack (`npm run db:start`) and are
 * skipped, loudly, when it is not reachable — so `npm test` still passes for
 * someone without Docker, but a skipped suite is visible in the report rather
 * than silently absent.
 *
 * They deliberately hit real Postgres instead of mocking the client: the whole
 * value of this adapter is in the parts a mock cannot check — soft-delete
 * filters, clinic scoping, timezone day boundaries, and nullable-column
 * coalescing.
 *
 * Isolation: everything is created under a dedicated test clinic and removed
 * afterwards, so the suite is re-runnable and never touches the seeded pilot
 * clinic.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database.types";
import { DentGrowMetricsEngine, MetricKey } from "@/business-brain";
import { SupabaseMetricsDataRepository } from "../metrics-repository";

const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const KEY =
  process.env.SUPABASE_TEST_SERVICE_KEY ??
  // Standard local-development service key — published in Supabase's own docs,
  // identical on every local stack, and worthless against any hosted project.
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
    `\n[metrics-repository] SKIPPED — local Supabase not reachable at ${URL}.` +
      `\n                     Start it with: npm run db:start\n`,
  );
}

// ── Fixture identifiers ───────────────────────────────────────────────────────
const CLINIC = "9f000000-0000-4000-8000-000000000001";
const OTHER_CLINIC = "9f000000-0000-4000-8000-0000000000ff";
const DENTIST = "9f000000-0000-4000-8000-000000000010";
const OTHER_DENTIST = "9f000000-0000-4000-8000-0000000000fe";
const P_RETURNING = "9f000000-0000-4000-8000-000000000021";
const P_NEW = "9f000000-0000-4000-8000-000000000022";
const P_DELETED = "9f000000-0000-4000-8000-000000000023";
const P_LAPSED = "9f000000-0000-4000-8000-000000000024";
const P_NEVER = "9f000000-0000-4000-8000-000000000025";

/** Business date under test, and the IST window it maps to. */
const DATE = "2026-03-16";
const TZ = "Asia/Kolkata"; // UTC+5:30 => 2026-03-15T18:30Z .. 2026-03-16T18:29:59Z
const AS_OF = "2026-03-16T06:30:00.000Z"; // 12:00 IST
const DOW = new Date(`${DATE}T12:00:00.000Z`).getUTCDay();

const db: SupabaseClient<Database> = createClient<Database>(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const raw = db as any;

async function insert(table: string, values: unknown) {
  const { error } = await raw.from(table).insert(values);
  if (error) throw new Error(`seed ${table}: ${error.message}`);
}

async function cleanup() {
  for (const clinic of [CLINIC, OTHER_CLINIC]) {
    await raw.from("clinics").delete().eq("id", clinic);
  }
  for (const user of [DENTIST, OTHER_DENTIST]) {
    await raw.auth.admin.deleteUser(user).catch(() => undefined);
  }
}

async function seed() {
  await cleanup();

  // Auth users first — profiles.id references auth.users.
  for (const [id, email] of [
    [DENTIST, "bb-dentist@test.local"],
    [OTHER_DENTIST, "bb-other@test.local"],
  ] as const) {
    const { error } = await raw.auth.admin.createUser({
      id,
      email,
      password: "password123",
      email_confirm: true,
    });
    if (error && !/already/i.test(error.message)) {
      throw new Error(`seed auth user: ${error.message}`);
    }
  }

  await insert("clinics", [
    { id: CLINIC, name: "BB Test Clinic" },
    { id: OTHER_CLINIC, name: "BB Other Clinic" },
  ]);
  await insert("clinic_settings", [
    { clinic_id: CLINIC, clinic_name: "BB Test Clinic", timezone: TZ, average_appointment_duration: 30 },
    // NOTE: every row in a bulk insert must carry the same keys — PostgREST
    // fills a missing key with NULL, not the column DEFAULT, which trips the
    // NOT NULL on average_appointment_duration.
    { clinic_id: OTHER_CLINIC, clinic_name: "BB Other Clinic", timezone: TZ, average_appointment_duration: 30 },
  ]);
  await insert("profiles", [
    { id: DENTIST, clinic_id: CLINIC, full_name: "BB Dentist", role: "dentist" },
    { id: OTHER_DENTIST, clinic_id: OTHER_CLINIC, full_name: "Other Dentist", role: "dentist" },
  ]);

  // 09:00–13:00 in 30-min steps => 8 slots. A rule on another weekday must be ignored.
  await insert("availability_rules", [
    { clinic_id: CLINIC, day_of_week: DOW, start_time: "09:00", end_time: "13:00", slot_duration_minutes: 30 },
    { clinic_id: CLINIC, day_of_week: (DOW + 1) % 7, start_time: "09:00", end_time: "18:00", slot_duration_minutes: 30 },
  ]);

  await insert("patients", [
    { id: P_RETURNING, clinic_id: CLINIC, name: "Returning", created_at: "2026-01-05T10:00:00Z" },
    { id: P_NEW, clinic_id: CLINIC, name: "Newcomer", created_at: "2026-03-16T05:00:00Z" },
    // Soft-deleted: registered today, but must not appear anywhere.
    { id: P_DELETED, clinic_id: CLINIC, name: "Deleted", created_at: "2026-03-16T05:00:00Z", deleted_at: "2026-03-16T06:00:00Z" },
  ]);

  await insert("appointments", [
    // 09:30 IST — inside the business day.
    { id: "9f000000-0000-4000-8000-000000000031", clinic_id: CLINIC, patient_id: P_RETURNING, dentist_id: DENTIST, scheduled_at: "2026-03-16T04:00:00Z", source: "walk_in", status: "completed" },
    // 00:30 IST on DATE — still inside the day, though a UTC-naive query would miss it.
    { id: "9f000000-0000-4000-8000-000000000032", clinic_id: CLINIC, patient_id: P_NEW, dentist_id: DENTIST, scheduled_at: "2026-03-15T19:00:00Z", source: "website", status: "scheduled" },
    // 23:30 IST on the PREVIOUS day — must be excluded.
    { id: "9f000000-0000-4000-8000-000000000033", clinic_id: CLINIC, patient_id: P_RETURNING, dentist_id: DENTIST, scheduled_at: "2026-03-15T18:00:00Z", source: "walk_in", status: "completed" },
    // Soft-deleted appointment on the day — must be excluded.
    { id: "9f000000-0000-4000-8000-000000000034", clinic_id: CLINIC, patient_id: P_RETURNING, dentist_id: DENTIST, scheduled_at: "2026-03-16T05:00:00Z", source: "walk_in", status: "completed", deleted_at: "2026-03-16T06:00:00Z" },
    // Another clinic, same day — must never leak in.
    { id: "9f000000-0000-4000-8000-0000000000a1", clinic_id: OTHER_CLINIC, patient_id: P_RETURNING, dentist_id: OTHER_DENTIST, scheduled_at: "2026-03-16T04:00:00Z", source: "walk_in", status: "completed" },
  ]);

  await insert("treatments", [
    // Completed today, consultant took 40% => clinic keeps 3000.
    { id: "9f000000-0000-4000-8000-000000000041", clinic_id: CLINIC, appointment_id: "9f000000-0000-4000-8000-000000000031", patient_id: P_RETURNING, created_at: "2026-03-16T04:00:00Z", treatment_type: "Root Canal", cost: 5000, status: "completed", performed_at: "2026-03-16T05:00:00Z" },
    // Completed today, no consultant => clinic_share NULL, must coalesce to cost.
    { id: "9f000000-0000-4000-8000-000000000042", clinic_id: CLINIC, appointment_id: "9f000000-0000-4000-8000-000000000031", patient_id: P_RETURNING, created_at: "2026-03-16T04:00:00Z", treatment_type: "Cleaning", cost: 1000, status: "completed", performed_at: "2026-03-16T05:30:00Z" },
    // Planned — must NOT count towards outstanding.
    { id: "9f000000-0000-4000-8000-000000000043", clinic_id: CLINIC, appointment_id: "9f000000-0000-4000-8000-000000000031", patient_id: P_RETURNING, created_at: "2026-03-16T04:00:00Z", treatment_type: "Crown", cost: 9000, status: "planned" },
    // Soft-deleted — must be invisible to every revenue metric.
    { id: "9f000000-0000-4000-8000-000000000044", clinic_id: CLINIC, appointment_id: "9f000000-0000-4000-8000-000000000031", patient_id: P_RETURNING, created_at: "2026-03-16T04:00:00Z", treatment_type: "Ghost", cost: 99999, status: "completed", performed_at: "2026-03-16T05:00:00Z", deleted_at: "2026-03-16T06:00:00Z" },
    // Other clinic.
    { id: "9f000000-0000-4000-8000-0000000000a2", clinic_id: OTHER_CLINIC, appointment_id: "9f000000-0000-4000-8000-0000000000a1", patient_id: P_RETURNING, created_at: "2026-03-16T04:00:00Z", treatment_type: "Elsewhere", cost: 77777, status: "completed", performed_at: "2026-03-16T05:00:00Z" },
  ]);

  // ── Scheduled-treatment fixtures (patient-level approximation) ─────────────
  // P_RETURNING has a future appointment; P_NEW does not.
  await insert("appointments", [
    // Next week, still active — P_RETURNING therefore has an upcoming visit.
    { id: "9f000000-0000-4000-8000-000000000091", clinic_id: CLINIC, patient_id: P_RETURNING, dentist_id: DENTIST, scheduled_at: "2026-03-24T04:00:00Z", source: "walk_in", status: "scheduled" },
    // Future but cancelled — must not count as an upcoming visit.
    { id: "9f000000-0000-4000-8000-000000000092", clinic_id: CLINIC, patient_id: P_NEW, dentist_id: DENTIST, scheduled_at: "2026-03-25T04:00:00Z", source: "walk_in", status: "cancelled" },
    // Future but a no-show record — likewise not an upcoming visit.
    { id: "9f000000-0000-4000-8000-000000000093", clinic_id: CLINIC, patient_id: P_NEW, dentist_id: DENTIST, scheduled_at: "2026-03-26T04:00:00Z", source: "walk_in", status: "no_show" },
  ]);

  // Case acceptance: one refused plan against the accepted work above.
  await insert("treatments", {
    id: "9f000000-0000-4000-8000-000000000085",
    clinic_id: CLINIC,
    appointment_id: "9f000000-0000-4000-8000-000000000031",
    patient_id: P_RETURNING,
    created_at: "2026-03-16T04:00:00Z", treatment_type: "Refused Implant",
    cost: 4000,
    status: "declined",
  });

  await insert("treatments", [
    // Patient has an upcoming visit => counts as scheduled.
    { id: "9f000000-0000-4000-8000-000000000081", clinic_id: CLINIC, appointment_id: "9f000000-0000-4000-8000-000000000031", patient_id: P_RETURNING, created_at: "2026-03-16T04:00:00Z", treatment_type: "Booked patient", cost: 100, status: "planned" },
    // Patient's only future appointments are cancelled / no-show => pending.
    { id: "9f000000-0000-4000-8000-000000000082", clinic_id: CLINIC, appointment_id: "9f000000-0000-4000-8000-000000000032", patient_id: P_NEW, created_at: "2026-03-16T04:00:00Z", treatment_type: "Unbooked patient", cost: 100, status: "planned" },
  ]);

  // Reactivation + window fixtures.
  await insert("patients", [
    // Last seen >180d before DATE (2026-03-16 => cutoff 2025-09-17), no future visit.
    { id: P_LAPSED, clinic_id: CLINIC, name: "Lapsed", created_at: "2024-01-01T10:00:00Z", last_visit: "2025-01-10T10:00:00Z" },
    // Never attended — acquisition, not lapse.
    { id: P_NEVER, clinic_id: CLINIC, name: "Never seen", created_at: "2024-01-01T10:00:00Z" },
  ]);

  await insert("payments", [
    { id: "9f000000-0000-4000-8000-000000000051", clinic_id: CLINIC, patient_id: P_RETURNING, amount: 2500, method: "cash", payment_date: DATE },
    { id: "9f000000-0000-4000-8000-000000000052", clinic_id: CLINIC, patient_id: P_RETURNING, amount: 500, method: "upi", payment_date: "2026-03-10" },
    { id: "9f000000-0000-4000-8000-000000000053", clinic_id: CLINIC, patient_id: P_RETURNING, amount: 4444, method: "cash", payment_date: DATE, deleted_at: "2026-03-16T06:00:00Z" },
  ]);

  await insert("queue_entries", [
    { id: "9f000000-0000-4000-8000-000000000061", clinic_id: CLINIC, appointment_id: "9f000000-0000-4000-8000-000000000031", patient_id: P_RETURNING, position: 1, status: "completed", queue_date: DATE, checked_in_at: "2026-03-16T04:00:00Z", called_at: "2026-03-16T04:20:00Z" },
    { id: "9f000000-0000-4000-8000-000000000062", clinic_id: CLINIC, appointment_id: "9f000000-0000-4000-8000-000000000032", patient_id: P_NEW, position: 2, status: "waiting", queue_date: DATE, checked_in_at: "2026-03-16T06:00:00Z", called_at: null },
  ]);

  await insert("follow_ups", [
    { id: "9f000000-0000-4000-8000-000000000071", clinic_id: CLINIC, patient_id: P_RETURNING, due_date: DATE, status: "pending" },
    { id: "9f000000-0000-4000-8000-000000000072", clinic_id: CLINIC, patient_id: P_RETURNING, due_date: "2026-03-01", status: "pending" },
    { id: "9f000000-0000-4000-8000-000000000073", clinic_id: CLINIC, patient_id: P_RETURNING, due_date: "2026-02-01", status: "completed" },
  ]);
}

const repository = new SupabaseMetricsDataRepository(db, { asOf: AS_OF });

describe.skipIf(!LOCAL_UP)("SupabaseMetricsDataRepository (integration)", () => {
  beforeAll(async () => {
    await seed();
  });
  afterAll(async () => {
    await cleanup();
  });

  describe("snapshot shape", () => {
    it("scopes the day by clinic timezone, not by UTC", async () => {
      const s = await repository.getClinicSnapshot(CLINIC, DATE);
      const ids = s.appointmentsToday.map((a) => a.id).sort();
      // 09:30 IST and 00:30 IST are in; 23:30 IST the previous day is out.
      expect(ids).toEqual([
        "9f000000-0000-4000-8000-000000000031",
        "9f000000-0000-4000-8000-000000000032",
      ]);
    });

    it("excludes soft-deleted rows from every collection", async () => {
      const s = await repository.getClinicSnapshot(CLINIC, DATE);
      expect(s.appointmentsToday.map((a) => a.id)).not.toContain(
        "9f000000-0000-4000-8000-000000000034",
      );
      expect(s.treatments.map((t) => t.id)).not.toContain("9f000000-0000-4000-8000-000000000044");
      expect(s.payments.map((p) => p.id)).not.toContain("9f000000-0000-4000-8000-000000000053");
      expect(s.patientsRegisteredToday.map((p) => p.id)).not.toContain(P_DELETED);
    });

    it("never leaks another clinic's rows", async () => {
      const s = await repository.getClinicSnapshot(CLINIC, DATE);
      expect(s.clinicId).toBe(CLINIC);
      expect(s.treatments.map((t) => t.id)).not.toContain("9f000000-0000-4000-8000-0000000000a2");
      expect(s.appointmentsToday.map((a) => a.id)).not.toContain(
        "9f000000-0000-4000-8000-0000000000a1",
      );
      expect(s.treatments.reduce((n, t) => n + t.cost, 0)).toBeLessThan(77777);
    });

    it("derives isScheduled from whether the patient has an upcoming visit", async () => {
      const s = await repository.getClinicSnapshot(CLINIC, DATE);
      const find = (suffix: string) => s.treatments.find((t) => t.id.endsWith(suffix));

      // P_RETURNING has a live future appointment.
      expect(find("081")?.isScheduled).toBe(true);
      // P_NEW's only future appointments are cancelled and no-show.
      expect(find("082")?.isScheduled).toBe(false);
    });

    it("ignores cancelled and no-show appointments when looking for an upcoming visit", async () => {
      const s = await repository.getClinicSnapshot(CLINIC, DATE);
      // Both of P_NEW's future rows exist but neither is a visit they will attend.
      const pNewTreatment = s.treatments.find((t) => t.id.endsWith("082"));
      expect(pNewTreatment?.isScheduled).toBe(false);
    });

    it("answers definitely — never unknown — for every treatment", async () => {
      const s = await repository.getClinicSnapshot(CLINIC, DATE);
      expect(s.treatments.every((t) => t.isScheduled !== null)).toBe(true);
    });

    it("supplies trailing and forward schedule windows with capacity", async () => {
      const s = await repository.getClinicSnapshot(CLINIC, DATE);
      // 30 days ending on DATE; 7 days starting the day after.
      expect(s.trailingWindow?.from).toBe("2026-02-15");
      expect(s.trailingWindow?.to).toBe(DATE);
      expect(s.forwardWindow?.from).toBe("2026-03-17");
      expect(s.forwardWindow?.to).toBe("2026-03-23");

      // The forward window must contain the future appointment seeded for
      // P_RETURNING (2026-03-24) only if it falls inside — it does not.
      expect(s.forwardWindow?.appointments.map((a) => a.id)).not.toContain(
        "9f000000-0000-4000-8000-000000000091",
      );
      // The trailing window contains today's appointments.
      expect(s.trailingWindow?.appointments.map((a) => a.id)).toContain(
        "9f000000-0000-4000-8000-000000000031",
      );
      // Capacity accumulates across the range, so it exceeds a single day's 8.
      expect(s.trailingWindow?.totalSlots).toBeGreaterThan(8);
    });

    it("carries createdAt on every appointment for lead-time analysis", async () => {
      const s = await repository.getClinicSnapshot(CLINIC, DATE);
      for (const a of s.appointmentsToday) {
        expect(a.createdAt).toBeTruthy();
        expect(Number.isNaN(Date.parse(a.createdAt))).toBe(false);
      }
    });

    it("supplies the patient roster with last-visit and booking state", async () => {
      const s = await repository.getClinicSnapshot(CLINIC, DATE);
      const roster = s.patientRoster ?? [];
      const lapsed = roster.find((p) => p.id === P_LAPSED);
      const never = roster.find((p) => p.id === P_NEVER);
      const booked = roster.find((p) => p.id === P_RETURNING);

      expect(lapsed?.lastVisit).not.toBeNull();
      expect(lapsed?.hasUpcomingAppointment).toBe(false);
      expect(never?.lastVisit).toBeNull();
      // P_RETURNING has the live future appointment seeded above.
      expect(booked?.hasUpcomingAppointment).toBe(true);
      // Soft-deleted patients never reach the roster.
      expect(roster.map((p) => p.id)).not.toContain(P_DELETED);
    });

    it("maps queue called_at to startedAt, leaving an active wait open", async () => {
      const s = await repository.getClinicSnapshot(CLINIC, DATE);
      const done = s.queueToday.find((q) => q.status === "completed");
      const waiting = s.queueToday.find((q) => q.status === "waiting");
      expect(done?.startedAt).not.toBeNull();
      expect(waiting?.startedAt).toBeNull();
    });

    it("returns only pending follow-ups due on or before the date", async () => {
      const s = await repository.getClinicSnapshot(CLINIC, DATE);
      expect(s.followUps.map((f) => f.id).sort()).toEqual([
        "9f000000-0000-4000-8000-000000000071",
        "9f000000-0000-4000-8000-000000000072",
      ]);
    });

    it("derives capacity from the matching weekday's rules only", async () => {
      const s = await repository.getClinicSnapshot(CLINIC, DATE);
      // 09:00–13:00 at 30 min = 8 slots. The other weekday's 18-slot rule is ignored.
      expect(s.capacity.totalSlotsToday).toBe(8);
    });

    it("stamps the snapshot with the injected capture time", async () => {
      const s = await repository.getClinicSnapshot(CLINIC, DATE);
      expect(s.asOf).toBe(AS_OF);
      expect(s.date).toBe(DATE);
    });

    it("returns an empty-but-valid snapshot for a day with no activity", async () => {
      const s = await repository.getClinicSnapshot(OTHER_CLINIC, "2026-03-20");
      // Date-scoped collections are empty…
      expect(s.appointmentsToday).toEqual([]);
      expect(s.queueToday).toEqual([]);
      expect(s.patientsRegisteredToday).toEqual([]);
      expect(s.patientsSeenToday).toEqual([]);
      // …and no availability rule exists for that clinic, so it offers no slots.
      expect(s.capacity.totalSlotsToday).toBe(0);
      // Treatments are cumulative by design (outstanding balance is a running
      // total), so this clinic still sees its own — and only its own.
      expect(s.treatments.map((t) => t.id)).toEqual(["9f000000-0000-4000-8000-0000000000a2"]);
    });
  });

  describe("end-to-end through the Metrics Engine", () => {
    it("produces correct metrics from real database rows", async () => {
      const engine = new DentGrowMetricsEngine(repository);
      const metrics = await engine.calculateMetrics(CLINIC, DATE);
      const v = (key: string) => metrics.find((m) => m.id.startsWith(`${key}:`))?.value;

      expect(v(MetricKey.APPOINTMENTS_TOTAL_TODAY)).toBe(2);
      expect(v(MetricKey.PATIENTS_NEW_TODAY)).toBe(1); // deleted patient excluded
      expect(v(MetricKey.PATIENTS_RETURNING_TODAY)).toBe(1);

      // Billable = completed only (5000 + 1000); planned 9000 excluded.
      // Payments = 2500 + 500 (deleted 4444 excluded) => 6000 - 3000.
      expect(v(MetricKey.REVENUE_OUTSTANDING)).toBe(3000);
      expect(v(MetricKey.REVENUE_COLLECTED_TODAY)).toBe(2500);
      // 9000 (crown) + 2 x 100 scheduling fixtures, all planned.
      expect(v(MetricKey.REVENUE_PENDING_TREATMENT_VALUE)).toBe(9200);
      // Planned treatments whose patient has NO upcoming visit. The crown and
      // "Booked patient" belong to P_RETURNING, who does have one; only
      // P_NEW's treatment is pending scheduling.
      expect(v(MetricKey.TREATMENT_ACCEPTED_PENDING_SCHEDULING)).toBe(1);

      expect(v(MetricKey.QUEUE_PATIENTS_WAITING)).toBe(1);
      // (20 min completed + 30 min still waiting at 12:00 IST) / 2
      expect(v(MetricKey.QUEUE_AVERAGE_WAITING_TIME)).toBe(25);

      expect(v(MetricKey.FOLLOWUPS_DUE_TODAY)).toBe(1);
      expect(v(MetricKey.FOLLOWUPS_OVERDUE)).toBe(1);

      expect(v(MetricKey.TREATMENT_COMPLETED_TODAY)).toBe(2);
      // 2 of 8 slots occupied.
      expect(v(MetricKey.CAPACITY_CHAIR_UTILIZATION)).toBe(25);
      expect(v(MetricKey.CAPACITY_AVAILABLE_SLOTS_TODAY)).toBe(6);

      // Trailing-window metrics. Both completed treatments were performed on
      // DATE, so the whole 30-day window is those two: 5000 + 1000.
      expect(v(MetricKey.REVENUE_PRODUCTION_30D)).toBe(6000);
      expect(v(MetricKey.TREATMENT_AVERAGE_CASE_VALUE_30D)).toBe(3000);
      // Payments in window: 2500 on DATE and 500 on 2026-03-10 (the 4444 row is
      // soft-deleted). 3000 / 6000 = 50%.
      expect(v(MetricKey.REVENUE_COLLECTION_RATE_30D)).toBe(50);
      // Only P_LAPSED: seen long ago and with no upcoming visit.
      expect(v(MetricKey.PATIENTS_REACTIVATION_CANDIDATES)).toBe(1);

      // Presented in the window: 5000 + 1000 + 9000 + 100 + 100 + 4000 = 19200,
      // of which the 4000 implant was declined.
      expect(v(MetricKey.TREATMENT_CASE_ACCEPTANCE_RATE_30D)).toBe(79.2);
    });

    it("is deterministic across repeated reads of unchanged data", async () => {
      const engine = new DentGrowMetricsEngine(repository);
      const a = await engine.calculateMetrics(CLINIC, DATE);
      const b = await engine.calculateMetrics(CLINIC, DATE);
      expect(a).toEqual(b);
    });
  });
});
