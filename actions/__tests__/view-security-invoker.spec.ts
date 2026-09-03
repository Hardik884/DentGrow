/**
 * actions/__tests__/view-security-invoker.spec.ts
 *
 * Regression guard for the RLS bypass fixed by
 * 20260902155414_fix_soft_delete_views_security_invoker.sql.
 *
 * WHAT WENT WRONG, AND WHY A TEST EXISTS AT ALL
 *   active_patients, active_appointments, active_treatments, active_payments
 *   and active_follow_ups were created without `security_invoker = true`. A
 *   view without that option runs with its OWNER's privileges; the owner is
 *   `postgres`, which owns the base tables, and a table owner is exempt from
 *   that table's RLS. PostgREST publishes every relation in `public`, and
 *   20260727000002 granted DML on "all tables" — which includes views. The
 *   result was that an unauthenticated caller holding only the PUBLIC anon key
 *   could read, modify and delete every clinical row in the database, across
 *   every clinic.
 *
 *   It survived because nothing pointed at it. `npm run db:lint` is
 *   plpgsql_check — a function-body linter that cannot see this. No application
 *   code selects from these views, so no test and no user journey touched them.
 *   And 20260803000000's own comment asserted the fleet was already correct,
 *   which is why nobody re-checked.
 *
 * WHAT THIS TEST ASSERTS
 *   The BEHAVIOUR, not the mechanism. A catalog assertion ("reloptions contains
 *   security_invoker") would pass for a view that is safe for some other reason
 *   and fail for one that is safe for a better one. What actually matters is:
 *
 *     1. anon reads NOTHING from any of these views;
 *     2. a dentist reads exactly what the base table gives them — no more
 *        (no cross-tenant leak) and no less (the fix did not break the views);
 *     3. a patient reads only their own record.
 *
 *   Assertion 2 is what stops this becoming a vacuous green tick: every view is
 *   proven to return a NON-ZERO count to the caller who is entitled to it, so
 *   "anon sees 0" cannot pass merely because the table is empty.
 *
 *   The sweep runs over EVERY view in `public`, discovered from a fixed list
 *   that includes the four views which were already correct — so a future view
 *   added without security_invoker is caught by adding one line here, and the
 *   existing ones stay pinned.
 *
 * Follows the repo convention: reachability guard + describe.skipIf, seeded
 * accounts, fixed namespaced UUIDs, afterAll cleanup (see consents-rls.spec.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:55321";
const ANON =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Seeded accounts (supabase/seed.sql). All passwords are password123.
const BRAIN = "brain@dentgrow.test"; // dentist, My Dental Clinic
const LIYING = "dentist@dentgrow.test"; // dentist, Dr. Liying's clinic
const PATIENT = "patient@dentgrow.test"; // portal patient, Dr. Liying's clinic

const MY_CLINIC = "00000000-0000-0000-0000-000000000001";
const PATIENT_ASHA = "b0000000-0000-4000-8000-000000000001";

/** Payment seeded here so active_payments is non-empty and cannot pass vacuously. */
const TEST_PAYMENT = "c9000000-0000-4000-8000-000000000001";

/**
 * Every view in the `public` schema, paired with the base table it wraps.
 *
 * ADD A ROW HERE WHENEVER YOU ADD A VIEW. The whole point of this file is that
 * a view which forgets `security_invoker = true` is caught by a failing test
 * rather than by an audit eighteen months later.
 */
const VIEWS: readonly { view: string; base: string }[] = [
  { view: "active_patients", base: "patients" },
  { view: "active_appointments", base: "appointments" },
  { view: "active_treatments", base: "treatments" },
  { view: "active_payments", base: "payments" },
  { view: "active_follow_ups", base: "follow_ups" },
  { view: "overdue_follow_ups", base: "follow_ups" },
  { view: "patient_treatments", base: "treatments" },
  { view: "receptionist_treatments", base: "treatments" },
  { view: "patient_dental_chart", base: "patient_teeth" },
  { view: "patient_consents", base: "consents" },
  {
    // Added by 20260903000200_data_processing_consent.sql. It participates in
    // the "anon sees nothing" sweep below; it is outside SOFT_DELETE_VIEWS, so
    // the count-agreement and non-vacuity assertions — which need a seeded base
    // table — correctly do not apply to it.
    view: "patient_data_consent_state",
    base: "data_consent_records",
  },
];

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${URL}/rest/v1/`, { headers: { apikey: ANON } });
    return res.ok || res.status === 404 || res.status === 400;
  } catch {
    return false;
  }
}
const LOCAL_UP = await reachable();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const service = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

async function tokenFor(email: string): Promise<string> {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`sign-in failed for ${email}`);
  return body.access_token as string;
}

/**
 * Exact row count for a relation as seen by `token`, via PostgREST's
 * count=exact. Requests zero rows: the count is the assertion, and no patient
 * data needs to cross the wire to make it.
 */
async function countAs(relation: string, token: string): Promise<number> {
  const res = await fetch(`${URL}/rest/v1/${relation}?select=*&limit=0`, {
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      Prefer: "count=exact",
    },
  });
  const range = res.headers.get("content-range");
  const total = range?.split("/")[1];
  if (!total || total === "*") throw new Error(`no count for ${relation}: ${range}`);
  return Number(total);
}

describe.skipIf(!LOCAL_UP)("public views must enforce RLS as the caller", () => {
  let brain = "";
  let liying = "";
  let patient = "";

  beforeAll(async () => {
    [brain, liying, patient] = await Promise.all([
      tokenFor(BRAIN),
      tokenFor(LIYING),
      tokenFor(PATIENT),
    ]);

    // active_payments is empty in the seed. Give it a row so the "anon sees 0"
    // assertion below is proving RLS rather than proving an empty table.
    await service.from("payments").delete().eq("id", TEST_PAYMENT);
    const { error } = await service.from("payments").insert({
      id: TEST_PAYMENT,
      clinic_id: MY_CLINIC,
      patient_id: PATIENT_ASHA,
      amount: 500,
      method: "cash",
      payment_date: new Date().toISOString().slice(0, 10),
    });
    if (error) throw new Error(`payment fixture insert failed: ${error.message}`);
  });

  afterAll(async () => {
    await service.from("payments").delete().eq("id", TEST_PAYMENT);
  });

  // ── 1. The bypass itself ────────────────────────────────────────────────
  // This is the assertion that would have failed before 20260902155414. Every
  // one of these returned the entire table, for every clinic, to a caller with
  // nothing but the public anon key.
  it.each(VIEWS.map((v) => v.view))(
    "%s returns nothing to an unauthenticated caller",
    async (view) => {
      expect(await countAs(view, ANON)).toBe(0);
    },
  );

  // ── 2. Views agree with their base table, per caller ────────────────────
  // Catches BOTH failure directions at once: a view that shows more than the
  // base table has bypassed RLS; a view that shows less has been broken by the
  // fix. The soft-delete views wrap the whole table, so the counts must match
  // exactly for a caller whose RLS grants them the clinic.
  const SOFT_DELETE_VIEWS = VIEWS.slice(0, 5);

  it.each(SOFT_DELETE_VIEWS)(
    "$view shows a dentist exactly what $base shows them",
    async ({ view, base }) => {
      const [viaView, viaBase] = await Promise.all([
        countAs(view, brain),
        countAs(base, brain),
      ]);
      expect(viaView).toBe(viaBase);
    },
  );

  // ── 3. The sweep is not vacuous ─────────────────────────────────────────
  // If the seed ever empties out, assertion 1 would pass for the wrong reason.
  // This proves each soft-delete view really does return rows to the caller
  // entitled to them, so "anon sees 0" is a statement about RLS.
  it("every soft-delete view returns rows to its own clinic's dentist", async () => {
    const counts = await Promise.all(
      SOFT_DELETE_VIEWS.map(async ({ view }) => [view, await countAs(view, brain)] as const),
    );
    for (const [view, n] of counts) {
      expect(n, `${view} is empty — the anon assertion above would pass vacuously`).toBeGreaterThan(0);
    }
  });

  // ── 4. Tenant isolation through the views ───────────────────────────────
  // A dentist in Dr. Liying's clinic must not see My Dental Clinic's rows, and
  // vice versa. Before the fix, either could read the other's entire table.
  it("a dentist cannot see another clinic's rows through a view", async () => {
    for (const { view } of SOFT_DELETE_VIEWS) {
      const res = await fetch(
        `${URL}/rest/v1/${view}?select=*&clinic_id=eq.${MY_CLINIC}&limit=0`,
        { headers: { apikey: ANON, Authorization: `Bearer ${liying}`, Prefer: "count=exact" } },
      );
      const total = Number(res.headers.get("content-range")?.split("/")[1] ?? -1);
      expect(total, `${view} leaked My Dental Clinic rows to Dr. Liying's dentist`).toBe(0);
    }
  });

  // ── 5. Role separation through the views ────────────────────────────────
  // internal_notes is dentist-only (CLAUDE.md §3). Before the fix a patient
  // could read every clinical note in the database through active_treatments.
  it("a patient cannot read clinical notes through a view", async () => {
    const res = await fetch(
      `${URL}/rest/v1/active_treatments?select=internal_notes&limit=0`,
      { headers: { apikey: ANON, Authorization: `Bearer ${patient}`, Prefer: "count=exact" } },
    );
    expect(Number(res.headers.get("content-range")?.split("/")[1] ?? -1)).toBe(0);
  });

  // ── 6. Patient scoping through the views ────────────────────────────────
  it("a patient sees only their own record in active_patients", async () => {
    expect(await countAs("active_patients", patient)).toBe(1);
  });
});
