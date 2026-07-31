/**
 * Integration specs for the Diagnosis Engine's entity-level context adapter.
 *
 * These run against the LOCAL Supabase stack and skip, loudly, when it is not
 * reachable — same contract as the sibling adapters.
 *
 * The claims worth proving are the ones a discriminator would act on:
 *
 *   - cancellation NOTICE, which lives only in appointment_history and is the
 *     whole difference between a slot lost three weeks ahead and one lost an
 *     hour before
 *   - attendance history counted strictly BEFORE each missed appointment, so
 *     two misses in one week do not both read as "repeat offender"
 *   - money, where billed and collected must not be conflated
 *   - and the one method that must return `null` rather than `[]`, because an
 *     empty list would answer the very question the discriminator is asking
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database.types";
import type { EntityWindow } from "@/business-brain";
import { applyEntityResolution, DEFAULT_ENTITY_RESOLUTION } from "@/business-brain";
import type { Diagnosis } from "@/business-brain";
import { SupabaseDiagnosisContext } from "../diagnosis-context";

const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
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
    `\n[diagnosis-context] SKIPPED — local Supabase not reachable at ${URL}.` +
      `\n                    Start it with: npm run db:start\n`,
  );
}

const C = "9fc00000-0000-4000-8000-000000000001";
const D = "9fc00000-0000-4000-8000-000000000010";
const P_REPEAT = "9fc00000-0000-4000-8000-000000000021";
const P_FIRST = "9fc00000-0000-4000-8000-000000000022";
const P_BOOKED = "9fc00000-0000-4000-8000-000000000023";

/** Window under test: the first week of April 2026. */
const FROM = "2026-04-01";
const TO = "2026-04-07";
const WINDOW: EntityWindow = { clinicId: C, from: FROM, to: TO, limit: 500 };

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
  await raw.from("clinics").delete().eq("id", C);
  await raw.auth.admin.deleteUser(D).catch(() => undefined);
}

// ── Fixture ids, named so assertions read as claims ──────────────────────────
const A_EARLY_CANCEL = "9fc00000-0000-4000-8000-000000000101"; // 48h notice
const A_LATE_CANCEL = "9fc00000-0000-4000-8000-000000000102"; // 2h notice, refilled
const A_UNTRACKED_CANCEL = "9fc00000-0000-4000-8000-000000000103"; // no history row
const A_NO_SHOW_1 = "9fc00000-0000-4000-8000-000000000104";
const A_NO_SHOW_2 = "9fc00000-0000-4000-8000-000000000105";
const A_REFILL = "9fc00000-0000-4000-8000-000000000106";
const A_ATTENDED = "9fc00000-0000-4000-8000-000000000107"; // prior attendance
const A_ARRIVED = "9fc00000-0000-4000-8000-000000000108";
const A_NO_CHECKIN = "9fc00000-0000-4000-8000-000000000109";

const T_PAID = "9fc00000-0000-4000-8000-000000000201";
const T_PART_PAID = "9fc00000-0000-4000-8000-000000000202";
const T_PENDING = "9fc00000-0000-4000-8000-000000000203";
const T_PENDING_BOOKED = "9fc00000-0000-4000-8000-000000000204";
const T_CANCELLED_SLOT = "9fc00000-0000-4000-8000-000000000205";

async function seed() {
  await cleanup();
  const { error } = await raw.auth.admin.createUser({
    id: D,
    email: "bb-ctx@test.local",
    password: "password123",
    email_confirm: true,
  });
  if (error && !/already/i.test(error.message)) throw new Error(`seed user: ${error.message}`);

  await insert("clinics", { id: C, name: "Context Clinic" });
  await insert("clinic_settings", {
    clinic_id: C,
    clinic_name: "Context Clinic",
    timezone: "Asia/Kolkata",
    average_appointment_duration: 30,
  });
  await insert("profiles", { id: D, clinic_id: C, full_name: "Ctx Dentist", role: "dentist" });
  await insert("patients", [
    { id: P_REPEAT, clinic_id: C, name: "Repeat", created_at: "2026-01-01T00:00:00Z" },
    { id: P_FIRST, clinic_id: C, name: "First timer", created_at: "2026-01-01T00:00:00Z" },
    { id: P_BOOKED, clinic_id: C, name: "Has a booking", created_at: "2026-01-01T00:00:00Z" },
  ]);

  const appt = (
    id: string,
    patient: string,
    scheduled: string,
    status: string,
  ) => ({
    id,
    clinic_id: C,
    patient_id: patient,
    dentist_id: D,
    scheduled_at: scheduled,
    source: "walk_in",
    status,
  });

  await insert("appointments", [
    appt(A_EARLY_CANCEL, P_FIRST, "2026-04-03T05:00:00Z", "cancelled"),
    appt(A_LATE_CANCEL, P_FIRST, "2026-04-04T05:00:00Z", "cancelled"),
    appt(A_UNTRACKED_CANCEL, P_FIRST, "2026-04-05T05:00:00Z", "cancelled"),
    // The slot A_LATE_CANCEL vacated, taken by someone else.
    appt(A_REFILL, P_BOOKED, "2026-04-04T05:00:00Z", "scheduled"),
    // P_REPEAT attends once, then misses twice in the window.
    appt(A_ATTENDED, P_REPEAT, "2026-03-01T05:00:00Z", "completed"),
    appt(A_NO_SHOW_1, P_REPEAT, "2026-04-02T05:00:00Z", "no_show"),
    appt(A_NO_SHOW_2, P_REPEAT, "2026-04-06T05:00:00Z", "no_show"),
    appt(A_ARRIVED, P_BOOKED, "2026-04-02T09:00:00Z", "completed"),
    appt(A_NO_CHECKIN, P_BOOKED, "2026-04-03T09:00:00Z", "completed"),
  ]);

  // Cancellation moments live ONLY here — appointments has no cancelled_at.
  await insert("appointment_history", [
    {
      appointment_id: A_EARLY_CANCEL,
      action: "status_changed",
      new_value: { status: "cancelled" },
      timestamp: "2026-04-01T05:00:00Z", // 48h before
    },
    {
      appointment_id: A_LATE_CANCEL,
      action: "status_changed",
      new_value: { status: "cancelled" },
      timestamp: "2026-04-04T03:00:00Z", // 2h before
    },
    // A_UNTRACKED_CANCEL deliberately has NO history row.
  ]);

  await insert("queue_entries", {
    id: "9fc00000-0000-4000-8000-000000000301",
    clinic_id: C,
    appointment_id: A_ARRIVED,
    patient_id: P_BOOKED,
    position: 1,
    status: "completed",
    queue_date: "2026-04-02",
    checked_in_at: "2026-04-02T09:12:00Z", // 12 minutes late
    called_at: "2026-04-02T09:30:00Z",
    // Booked for 30 minutes, actually took 50 — the overrun the service-time
    // discriminator exists to find.
    completed_at: "2026-04-02T10:20:00Z",
  });

  await insert("treatments", [
    {
      id: T_PAID,
      discount_amount: 0,
      discount_reason: null,
      clinic_id: C,
      appointment_id: A_ARRIVED,
      patient_id: P_BOOKED,
      treatment_type: "Cleaning",
      cost: 2000,
      status: "completed",
      performed_at: "2026-04-02T09:30:00Z",
      created_at: "2026-04-02T09:30:00Z",
    },
    {
      id: T_PART_PAID,
      clinic_id: C,
      appointment_id: A_NO_CHECKIN,
      patient_id: P_BOOKED,
      treatment_type: "Crown",
      cost: 20000,
      // 2,000 off as a goodwill gesture: 18,000 chargeable, 8,000 paid, so
      // 10,000 uncollected. Discount and shortfall must stay distinguishable.
      discount_amount: 2000,
      discount_reason: "Goodwill",
      status: "completed",
      performed_at: "2026-04-03T09:30:00Z",
      created_at: "2026-04-03T09:30:00Z",
    },
    {
      // Booked into the slot that was then cancelled. Status `cancelled` so it
      // cannot leak into the pending, outstanding or completed lists — the only
      // thing under test here is that the slot's treatment type survives.
      id: T_CANCELLED_SLOT,
      discount_amount: 0,
      discount_reason: null,
      clinic_id: C,
      appointment_id: A_EARLY_CANCEL,
      patient_id: P_FIRST,
      treatment_type: "Extraction",
      cost: 3000,
      status: "cancelled",
      created_at: "2026-03-30T05:00:00Z",
    },
    {
      id: T_PENDING,
      discount_amount: 0,
      discount_reason: null,
      clinic_id: C,
      appointment_id: A_ATTENDED,
      patient_id: P_FIRST,
      treatment_type: "Root Canal",
      cost: 15000,
      status: "planned",
      created_at: "2026-04-01T05:00:00Z",
    },
    {
      id: T_PENDING_BOOKED,
      discount_amount: 0,
      discount_reason: null,
      clinic_id: C,
      appointment_id: A_ATTENDED,
      patient_id: P_BOOKED,
      treatment_type: "Implant",
      cost: 50000,
      status: "planned",
      created_at: "2026-04-01T05:00:00Z",
    },
  ]);

  await insert("payments", [
    // T_PAID fully settled.
    { id: "9fc00000-0000-4000-8000-000000000401", clinic_id: C, patient_id: P_BOOKED, treatment_id: T_PAID, amount: 2000, method: "cash", payment_date: "2026-04-02" },
    // T_PART_PAID half settled.
    { id: "9fc00000-0000-4000-8000-000000000402", clinic_id: C, patient_id: P_BOOKED, treatment_id: T_PART_PAID, amount: 8000, method: "upi", payment_date: "2026-04-03" },
  ]);

  // P_BOOKED has a visit after the window, so their pending plan is not
  // "unscheduled". P_FIRST has none.
  await insert("appointments", appt(
    "9fc00000-0000-4000-8000-00000000010a",
    P_BOOKED,
    "2026-04-20T05:00:00Z",
    "scheduled",
  ));
}

const ctx = new SupabaseDiagnosisContext(db);

describe.skipIf(!LOCAL_UP)("diagnosis context (integration)", () => {
  beforeAll(seed);
  afterAll(cleanup);

  describe("cancellation events", () => {
    it("derives notice hours from the audit trail, not the appointment row", async () => {
      // appointments has no cancelled_at; appointment_history is the only record
      // of WHEN a slot was lost, and notice is the point of the discriminator.
      const events = await ctx.listCancellationEvents(WINDOW);
      const early = events?.find((e) => e.appointmentId === A_EARLY_CANCEL);
      const late = events?.find((e) => e.appointmentId === A_LATE_CANCEL);
      expect(early?.noticeHours).toBe(48);
      expect(late?.noticeHours).toBe(2);
    });

    it("leaves notice NULL when the cancellation moment was never recorded", async () => {
      // Guessing from created_at or scheduled_at would fabricate the exact
      // quantity being measured.
      const events = await ctx.listCancellationEvents(WINDOW);
      const untracked = events?.find((e) => e.appointmentId === A_UNTRACKED_CANCEL);
      expect(untracked?.cancelledAt).toBeNull();
      expect(untracked?.noticeHours).toBeNull();
    });

    it("gives a no-show no notice at all, rather than zero", async () => {
      // Zero notice would mean "cancelled at the last second", which is a
      // different event from never turning up.
      const events = await ctx.listCancellationEvents(WINDOW);
      const noShow = events?.find((e) => e.appointmentId === A_NO_SHOW_1);
      expect(noShow?.outcome).toBe("no_show");
      expect(noShow?.noticeHours).toBeNull();
    });

    it("reports whether the lost slot was recovered", async () => {
      const events = await ctx.listCancellationEvents(WINDOW);
      expect(events?.find((e) => e.appointmentId === A_LATE_CANCEL)?.slotRefilled).toBe(true);
      expect(events?.find((e) => e.appointmentId === A_EARLY_CANCEL)?.slotRefilled).toBe(false);
    });

    it("carries the treatment type that was booked into the slot", async () => {
      // Which work was lost matters: a week of cancelled hygiene visits and a
      // week of cancelled crowns are the same count and different problems.
      const events = await ctx.listCancellationEvents(WINDOW);
      expect(events?.find((e) => e.appointmentId === A_EARLY_CANCEL)?.treatmentType).toBe(
        "Extraction",
      );
      expect(events?.find((e) => e.appointmentId === A_NO_SHOW_1)?.treatmentType).toBeNull();
    });

    it("stays inside the window and the clinic", async () => {
      const events = await ctx.listCancellationEvents(WINDOW);
      expect(events?.every((e) => e.date >= FROM && e.date <= TO)).toBe(true);
      const elsewhere = await ctx.listCancellationEvents({
        ...WINDOW,
        clinicId: "9fc00000-0000-4000-8000-0000000000ff",
      });
      expect(elsewhere).toEqual([]);
    });
  });

  describe("no-show history", () => {
    it("counts prior attendance strictly BEFORE each missed appointment", async () => {
      // Both misses belong to the same patient. If history were counted from the
      // window's edge they would read identically, and the discriminator that
      // separates a first lapse from a pattern would be useless.
      const history = await ctx.listNoShowHistory(WINDOW);
      const first = history?.find((h) => h.appointmentId === A_NO_SHOW_1);
      const second = history?.find((h) => h.appointmentId === A_NO_SHOW_2);
      expect(first?.priorMissed).toBe(0);
      expect(second?.priorMissed).toBe(1);
      expect(first?.priorAttended).toBe(1);
      expect(second?.priorAttended).toBe(1);
    });

    it("reports the last date the patient actually attended", async () => {
      const history = await ctx.listNoShowHistory(WINDOW);
      expect(history?.[0]?.lastAttendedDate).toBe("2026-03-01");
    });
  });

  describe("pending treatments", () => {
    it("excludes work whose patient has an upcoming visit", async () => {
      const pending = await ctx.listPendingTreatments(WINDOW);
      const ids = pending?.map((p) => p.treatmentId) ?? [];
      expect(ids).toContain(T_PENDING);
      expect(ids).not.toContain(T_PENDING_BOOKED);
    });

    it("ages the plan from acceptance to the end of the window", async () => {
      const pending = await ctx.listPendingTreatments(WINDOW);
      const row = pending?.find((p) => p.treatmentId === T_PENDING);
      expect(row?.acceptedOn).toBe("2026-04-01");
      expect(row?.ageDays).toBe(6); // 1 April -> 7 April
      expect(row?.quotedValue.value).toBe(15000);
    });
  });

  describe("outstanding balances", () => {
    it("omits fully-settled work — a balance of zero is not outstanding", async () => {
      const balances = await ctx.listOutstandingBalances(WINDOW);
      expect(balances?.map((b) => b.invoiceId)).not.toContain(T_PAID);
    });

    it("nets the discount off what is still owed", async () => {
      // 20,000 billed less 2,000 discount less 8,000 paid. Counting the
      // concession as a receivable would inflate the book by money the clinic
      // chose not to charge.
      const balances = await ctx.listOutstandingBalances(WINDOW);
      const row = balances?.find((b) => b.invoiceId === T_PART_PAID);
      expect(row?.amountOutstanding.value).toBe(10000);
      expect(row?.amountPaid.value).toBe(8000);
    });

    it("reports what is still owed and what has been paid, separately", async () => {
      const balances = await ctx.listOutstandingBalances(WINDOW);
      const row = balances?.find((b) => b.invoiceId === T_PART_PAID);
      expect(row?.amountOutstanding.value).toBe(10000);
      expect(row?.amountPaid.value).toBe(8000);
      expect(row?.ageDays).toBe(4); // 3 April -> 7 April
    });
  });

  describe("appointment arrivals", () => {
    it("measures lateness against the scheduled start", async () => {
      const arrivals = await ctx.listAppointmentArrivals(WINDOW);
      const arrived = arrivals?.find((a) => a.appointmentId === A_ARRIVED);
      expect(arrived?.arrivalDeltaMinutes).toBe(12);
      expect(arrived?.seenAt).toBe("2026-04-02T09:30:00+00:00");
    });

    it("measures how long the appointment actually took", async () => {
      // Booked 30 minutes, called in 09:30, finished 10:20 — 50 actual.
      const arrivals = await ctx.listAppointmentArrivals(WINDOW);
      const arrived = arrivals?.find((a) => a.appointmentId === A_ARRIVED);
      expect(arrived?.scheduledMinutes).toBe(30);
      expect(arrived?.actualMinutes).toBe(50);
      expect(arrived?.finishedAt).toBe("2026-04-02T10:20:00+00:00");
    });

    it("leaves actual duration NULL when the visit was never closed out", async () => {
      // A plan is not an observation. An appointment with no recorded end has no
      // measurable duration, and substituting the booked length would report the
      // plan back as if it were the result.
      const arrivals = await ctx.listAppointmentArrivals(WINDOW);
      const none = arrivals?.find((a) => a.appointmentId === A_NO_CHECKIN);
      expect(none?.actualMinutes).toBeNull();
      expect(none?.finishedAt).toBeNull();
    });

    it("leaves arrival NULL when nobody checked the patient in", async () => {
      // Never-checked-in and never-arrived are indistinguishable from here, and
      // a null keeps that ambiguity visible instead of resolving it wrongly.
      const arrivals = await ctx.listAppointmentArrivals(WINDOW);
      const none = arrivals?.find((a) => a.appointmentId === A_NO_CHECKIN);
      expect(none?.arrivedAt).toBeNull();
      expect(none?.arrivalDeltaMinutes).toBeNull();
    });
  });

  describe("completed treatments", () => {
    it("keeps discounts apart from uncollected money", async () => {
      // The whole point: money given away and money never received are opposite
      // problems that look identical in a revenue total.
      const completed = await ctx.listCompletedTreatments(WINDOW);
      const crown = completed?.find((t) => t.treatmentId === T_PART_PAID);
      expect(crown?.billedValue.value).toBe(20000);
      expect(crown?.discountValue.value).toBe(2000);
      expect(crown?.collectedValue.value).toBe(8000);
    });

    it("reports no discount as zero, not as missing", async () => {
      const completed = await ctx.listCompletedTreatments(WINDOW);
      expect(completed?.find((t) => t.treatmentId === T_PAID)?.discountValue.value).toBe(0);
    });

    it("keeps billed and collected apart", async () => {
      // Conflating them is exactly the confusion the discriminator exists to
      // resolve: a cheaper case mix and unpaid work look identical in a total.
      const completed = await ctx.listCompletedTreatments(WINDOW);
      const crown = completed?.find((t) => t.treatmentId === T_PART_PAID);
      expect(crown?.billedValue.value).toBe(20000);
      expect(crown?.collectedValue.value).toBe(8000);
    });

    it("includes fully-paid work, which the balance list excludes", async () => {
      const completed = await ctx.listCompletedTreatments(WINDOW);
      const clean = completed?.find((t) => t.treatmentId === T_PAID);
      expect(clean?.billedValue.value).toBe(2000);
      expect(clean?.collectedValue.value).toBe(2000);
    });
  });

  describe("what this deployment cannot answer", () => {
    it("returns NULL for recall contact attempts, never an empty list", async () => {
      // DentGrow records no contact attempts. `[]` would assert that none were
      // made — which is one of the two answers the discriminator is trying to
      // choose between, so returning it would settle the question by accident,
      // in the direction that blames the clinic.
      const attempts = await ctx.listRecallContactAttempts(WINDOW);
      expect(attempts).toBeNull();
    });

    it("distinguishes that from a method that genuinely found nothing", async () => {
      const empty = await ctx.listCompletedTreatments({
        ...WINDOW,
        from: "2020-01-01",
        to: "2020-01-02",
      });
      expect(empty).toEqual([]);
      expect(empty).not.toBeNull();
    });
  });

  /**
   * Adapter and resolvers, joined.
   *
   * The unit specs feed the resolvers literals; these feed them rows that came
   * out of Postgres. That is the join worth testing — a shape mismatch between
   * what the adapter returns and what a resolver reads would pass both sets of
   * unit tests and produce nothing in production.
   */
  describe("end to end with the resolvers", () => {
    const ADVANCE = "cancellation_dominant";
    const OTHER = "no_show_dominant";

    function pendingDiagnosis(discriminatorSlug: string): Diagnosis {
      const id = "diagnosis.schedule_attrition:ctx:2026-04-07";
      const h = (slug: string) => ({
        id: `${id}#h.${slug}`,
        statement: `Statement for ${slug}.`,
        status: "undetermined" as const,
        confidence: 0.4,
        supporting: [],
        contradicting: [],
        requiredData: ["entity rows"],
      });
      return {
        id,
        pattern: "schedule_attrition",
        title: "Appointments booked and then lost",
        summary: "Seeded losses.",
        category: "scheduling",
        severity: "medium",
        confidence: 0.5,
        persistence: "transient",
        signalIds: [],
        metricIds: [],
        hypotheses: [h(ADVANCE), h(OTHER)],
        discriminators: [
          {
            id: `${id}#d.${discriminatorSlug}`,
            description: "Would separate the two.",
            wouldSeparate: [`${id}#h.${ADVANCE}`, `${id}#h.${OTHER}`],
            availability: "requires_entity_data" as const,
          },
        ],
        relatedEntities: [],
        evidence: [],
        generatedAt: "2026-04-07T06:30:00.000Z",
      };
    }

    it("turns real cancellation rows into evidence with the real numbers", async () => {
      const events = await ctx.listCancellationEvents(WINDOW);
      const resolved = applyEntityResolution(
        [pendingDiagnosis("cancellation_timing")],
        { cancellationEvents: events },
        "2026-04-07T06:30:00.000Z",
        DEFAULT_ENTITY_RESOLUTION,
      );
      const description = resolved[0].evidence[0]?.description ?? "";
      // 5 lost appointments seeded (3 cancelled + 2 no-shows), 2 of them with a
      // recorded cancellation moment.
      expect(description).toContain("2 of 5 lost appointment(s)");
      expect(description).toContain("cancellation moment");
    });

    it("reports the real refill outcome", async () => {
      const events = await ctx.listCancellationEvents(WINDOW);
      const resolved = applyEntityResolution(
        [pendingDiagnosis("slot_refill_outcome")],
        { cancellationEvents: events },
        "2026-04-07T06:30:00.000Z",
        DEFAULT_ENTITY_RESOLUTION,
      );
      // Exactly one of the seeded losses had its slot taken.
      expect(resolved[0].evidence[0]?.description).toContain("1 of 5 vacated slot(s)");
    });

    it("leaves hypotheses open when the deployment cannot answer", async () => {
      // The null path, end to end: the adapter returns null for recall contact
      // attempts, and nothing downstream may read that as "no attempts made".
      const attempts = await ctx.listRecallContactAttempts(WINDOW);
      expect(attempts).toBeNull();

      const before = pendingDiagnosis("recall_contact_attempts");
      const after = applyEntityResolution(
        [before],
        { recallContactAttempts: attempts },
        "2026-04-07T06:30:00.000Z",
        DEFAULT_ENTITY_RESOLUTION,
      );
      expect(after[0]).toEqual(before);
      expect(after[0].discriminators[0].availability).toBe("requires_entity_data");
    });
  });
});
