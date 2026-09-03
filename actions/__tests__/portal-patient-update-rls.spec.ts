/**
 * actions/__tests__/portal-patient-update-rls.spec.ts
 *
 * Regression guard for 20260903000100_portal_patient_update_pin.sql.
 *
 * The policy this replaces claimed, in its own comment, that clinical and
 * system fields "must remain immutable from the portal" — and asserted nothing
 * of the kind. A test that only checked the happy path would have passed
 * against the broken policy, so every case here is an attack the old policy
 * allowed, run as a real portal session against a real database.
 *
 * The cross-tenant case is the one that matters most: auth_patient_id()
 * resolves through patient_portal_links, which carries no clinic_id, so
 * changing clinic_id did not change what the policy would allow.
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

const PATIENT = "patient@dentgrow.test";
const OTHER_CLINIC = "00000000-0000-0000-0000-000000000001"; // My Dental Clinic

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

describe.skipIf(!LOCAL_UP)("patients: portal update own profile", () => {
  let token = "";
  let patientId = "";
  /** The row as seeded, so every assertion can prove nothing moved. */
  let original: Record<string, unknown> = {};

  /** PATCH the caller's own patient row as the portal session. */
  async function portalPatch(body: Record<string, unknown>): Promise<Response> {
    return fetch(`${URL}/rest/v1/patients?id=eq.${patientId}`, {
      method: "PATCH",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });
  }

  async function currentRow(): Promise<Record<string, unknown>> {
    const { data } = await service
      .from("patients")
      .select("*")
      .eq("id", patientId)
      .single();
    return data;
  }

  beforeAll(async () => {
    token = await tokenFor(PATIENT);

    const { data: users } = await service.auth.admin.listUsers();
    const user = (users?.users ?? []).find(
      (u: { email?: string }) => u.email === PATIENT
    );
    if (!user) throw new Error("seeded portal patient not found");

    const { data: link } = await service
      .from("patient_portal_links")
      .select("patient_id")
      .eq("user_id", user.id)
      .single();
    if (!link?.patient_id) throw new Error("seeded portal link not found");

    patientId = link.patient_id;
    original = await currentRow();
  });

  afterAll(async () => {
    if (!LOCAL_UP || !patientId) return;
    // Restore whatever the permitted-edit case changed.
    await service
      .from("patients")
      .update({
        phone: original.phone,
        address: original.address,
        emergency_contact_name: original.emergency_contact_name,
        emergency_contact_phone: original.emergency_contact_phone,
      })
      .eq("id", patientId);
  });

  // ── The edits the portal is FOR ───────────────────────────────────────────

  it("still allows the contact-detail edits the portal actually makes", async () => {
    const res = await portalPatch({
      phone: "+919000000001",
      address: "12 Test Street",
      emergency_contact_name: "Test Contact",
      emergency_contact_phone: "+919000000002",
    });

    expect(res.ok).toBe(true);
    const row = await currentRow();
    expect(row.phone).toBe("+919000000001");
    expect(row.address).toBe("12 Test Street");
  });

  // ── The cross-tenant escape ───────────────────────────────────────────────

  it("refuses to move the record into another clinic", async () => {
    const res = await portalPatch({ clinic_id: OTHER_CLINIC });
    expect(res.ok).toBe(false);

    const row = await currentRow();
    expect(row.clinic_id).toBe(original.clinic_id);
    expect(row.clinic_id).not.toBe(OTHER_CLINIC);
  });

  it("refuses a clinic change smuggled alongside a permitted edit", async () => {
    // The realistic shape of the attack: one legitimate field to look normal.
    const res = await portalPatch({
      phone: "+919000000003",
      clinic_id: OTHER_CLINIC,
    });
    expect(res.ok).toBe(false);

    const row = await currentRow();
    expect(row.clinic_id).toBe(original.clinic_id);
    // The whole statement is rejected, so the permitted field did not land either.
    expect(row.phone).not.toBe("+919000000003");
  });

  // ── Clinical record integrity ─────────────────────────────────────────────

  const PINNED: ReadonlyArray<[string, unknown]> = [
    ["name", "Renamed By Patient"],
    ["notes", "Patient rewrote the clinician's notes"],
    ["date_of_birth", "1900-01-01"],
    ["gender", "other"],
    ["total_visits", 999],
    ["last_visit", "2020-01-01T00:00:00.000Z"],
    ["deleted_at", "2020-01-01T00:00:00.000Z"],
    ["payment_plan_until", "2099-01-01"],
  ];

  for (const [column, value] of PINNED) {
    it(`refuses to change ${column}`, async () => {
      const res = await portalPatch({ [column]: value });
      expect(res.ok).toBe(false);

      const row = await currentRow();
      expect(row[column]).toEqual(original[column]);
    });
  }

  // ── Someone else's record ─────────────────────────────────────────────────

  it("cannot touch another patient's record at all", async () => {
    const { data: others } = await service
      .from("patients")
      .select("id")
      .neq("id", patientId)
      .limit(1);

    const otherId = (others ?? [])[0]?.id;
    // Non-vacuous: there has to be another patient for this to mean anything.
    expect(otherId).toBeTruthy();

    const res = await fetch(`${URL}/rest/v1/patients?id=eq.${otherId}`, {
      method: "PATCH",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ phone: "+919000000009" }),
    });

    // RLS filters the row out, so nothing is updated.
    const body = await res.json().catch(() => []);
    expect(Array.isArray(body) ? body.length : 0).toBe(0);
  });
});
