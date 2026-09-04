/**
 * actions/__tests__/portal-activation.spec.ts
 *
 * The guarantees that make clinic-issued portal access safe.
 *
 * These run against the DATABASE rather than mocking the lookup, because every
 * property here is a property of the schema plus the query, and a mock would
 * only prove that the mock agrees with itself. In particular the
 * one-record-per-address rule is a partial unique index, not application logic,
 * and the only way to know it holds is to try to violate it.
 *
 * Follows the repo convention: reachability guard + describe.skipIf, fixed
 * namespaced UUIDs, afterAll cleanup (see consents-rls.spec.ts).
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

const CLINIC_A = "00000000-0000-0000-0000-000000000001"; // My Dental Clinic
const CLINIC_B = "11111111-1111-1111-1111-111111111111"; // Dr. Liying's Dental Care

const P_WITH_EMAIL = "e1000000-0000-4000-8000-000000000001";
const P_NO_EMAIL = "e1000000-0000-4000-8000-000000000002";
const P_DUP_A = "e1000000-0000-4000-8000-000000000003";
const P_DUP_B = "e1000000-0000-4000-8000-000000000004";
const P_COLLIDE = "e1000000-0000-4000-8000-000000000005";
const P_SOFT_DELETED = "e1000000-0000-4000-8000-000000000006";

const EMAIL_ELIGIBLE = "eligible.patient@test.local";
const EMAIL_SHARED = "shared.across.clinics@test.local";
const EMAIL_DELETED = "deleted.patient@test.local";

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

const ALL_IDS = [P_WITH_EMAIL, P_NO_EMAIL, P_DUP_A, P_DUP_B, P_COLLIDE, P_SOFT_DELETED];

describe.skipIf(!LOCAL_UP)("patient email → portal eligibility", () => {
  beforeAll(async () => {
    await service.from("patients").delete().in("id", ALL_IDS);

    await service.from("patients").insert([
      // The ordinary eligible case.
      { id: P_WITH_EMAIL, clinic_id: CLINIC_A, name: "Eligible Patient", email: EMAIL_ELIGIBLE },
      // A walk-in the clinic created with no address: no portal access.
      { id: P_NO_EMAIL, clinic_id: CLINIC_A, name: "No Email Patient" },
      // The SAME address on records in two DIFFERENT clinics. Allowed by the
      // schema — a person can attend two practices — and refused at activation.
      { id: P_DUP_A, clinic_id: CLINIC_A, name: "Shared Address A", email: EMAIL_SHARED },
      { id: P_DUP_B, clinic_id: CLINIC_B, name: "Shared Address B", email: EMAIL_SHARED },
      // Soft-deleted, holding an address. Must be invisible to activation AND
      // must not block the clinic re-issuing that address.
      {
        id: P_SOFT_DELETED,
        clinic_id: CLINIC_A,
        name: "Deleted Patient",
        email: EMAIL_DELETED,
        deleted_at: new Date().toISOString(),
      },
    ]);
  });

  afterAll(async () => {
    await service.from("patients").delete().in("id", ALL_IDS);
  });

  // ── The schema guarantee everything else rests on ────────────────────────

  it("refuses a second ACTIVE patient with the same address in one clinic", async () => {
    // This is what makes "one address resolves to one record" true. Without it,
    // activation could not say which record an address means, and the answer
    // would decide whose clinical history the person sees.
    const { error } = await service.from("patients").insert({
      id: P_COLLIDE,
      clinic_id: CLINIC_A,
      name: "Collision",
      email: EMAIL_ELIGIBLE,
    });

    expect(error).not.toBeNull();
    expect(`${error.message} ${error.details ?? ""}`).toMatch(
      /uq_patients_clinic_email_active|duplicate key/i
    );
  });

  it("compares addresses case-insensitively, so capitals are not a way around it", async () => {
    const { error } = await service.from("patients").insert({
      id: P_COLLIDE,
      clinic_id: CLINIC_A,
      name: "Collision",
      email: EMAIL_ELIGIBLE.toUpperCase(),
    });

    expect(error).not.toBeNull();
  });

  it("ALLOWS the same address in a different clinic — a person can attend two", async () => {
    const { data } = await service
      .from("patients")
      .select("id, clinic_id")
      .eq("email", EMAIL_SHARED)
      .is("deleted_at", null);

    expect((data ?? []).length).toBe(2);
    expect(new Set((data ?? []).map((r: { clinic_id: string }) => r.clinic_id)).size).toBe(2);
  });

  it("lets a clinic re-issue an address held only by a soft-deleted record", async () => {
    const { error } = await service.from("patients").insert({
      id: P_COLLIDE,
      clinic_id: CLINIC_A,
      name: "Reissued",
      email: EMAIL_DELETED,
    });

    expect(error).toBeNull();
    await service.from("patients").delete().eq("id", P_COLLIDE);
  });

  // ── What the activation lookup will and will not find ────────────────────

  it("finds exactly one active record for an eligible address", async () => {
    const { data } = await service
      .from("patients")
      .select("id, clinic_id")
      .eq("email", EMAIL_ELIGIBLE)
      .is("deleted_at", null);

    expect((data ?? []).length).toBe(1);
    expect(data[0].id).toBe(P_WITH_EMAIL);
    // The clinic comes from the RECORD. Nothing the browser sends is consulted.
    expect(data[0].clinic_id).toBe(CLINIC_A);
  });

  it("finds nothing for a patient the clinic created without an address", async () => {
    const { data } = await service
      .from("patients")
      .select("id")
      .eq("id", P_NO_EMAIL)
      .not("email", "is", null);

    expect(data ?? []).toEqual([]);
  });

  it("finds nothing for a soft-deleted record, even though it holds an address", async () => {
    const { data } = await service
      .from("patients")
      .select("id")
      .eq("email", EMAIL_DELETED)
      .is("deleted_at", null);

    expect(data ?? []).toEqual([]);
  });

  it("finds nothing for an address no clinic has issued", async () => {
    const { data } = await service
      .from("patients")
      .select("id")
      .eq("email", "nobody-has-this@test.local")
      .is("deleted_at", null);

    expect(data ?? []).toEqual([]);
  });

  // ── Tenancy is not weakened by any of this ───────────────────────────────

  it("keeps the email column invisible to an unauthenticated caller", async () => {
    // patients RLS is unchanged by the migration — email is just another column
    // on it — but a new column on a table holding contact details is exactly the
    // kind of thing worth re-asserting rather than assuming.
    const res = await fetch(`${URL}/rest/v1/patients?select=email&limit=0`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Prefer: "count=exact" },
    });
    const total = res.headers.get("content-range")?.split("/")[1];
    expect(total).toBe("0");
  });
});
