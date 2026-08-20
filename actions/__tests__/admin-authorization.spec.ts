/**
 * actions/__tests__/admin-authorization.spec.ts
 *
 * DB-level security tests for the platform admin capability.
 *
 * The /admin portal is gated on one fact: profiles.is_admin. If a client can
 * write that column, the whole separation is theatre — anyone could grant
 * themselves the flag with a single request against the public anon key and
 * then walk in through the front door with valid credentials. So the tests
 * that matter are not "does the admin page render", they are these:
 *
 *   1. Exactly the intended account holds the flag.
 *   2. No authenticated role can grant it to itself through RLS.
 *   3. Granting it did not change the account's role or clinic — admin is
 *      additive, and the owner account must keep its dev-clinic access.
 *   4. The existing pins (role, clinic_id) still hold, so amending the policy
 *      did not regress the fix from 20260727000000.
 *   5. auth_is_admin() reports the truth for the caller and only the caller.
 *
 * Follows the repo convention: reachability guard + describe.skipIf, seeded
 * accounts, no mutation left behind.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:55321";
const ANON =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Seeded accounts (supabase/seed.sql). All local passwords are password123.
const ADMIN = { email: "owner@dentgrow.local", password: "password123" };
const DENTIST = { email: "dentist@dentgrow.test", password: "password123" };
const RECEPTIONIST = { email: "receptionist@dentgrow.test", password: "password123" };
const PATIENT = { email: "patient@dentgrow.test", password: "password123" };

const MY_CLINIC = "00000000-0000-0000-0000-000000000001";
const LIYING_CLINIC = "11111111-1111-1111-1111-111111111111";

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
const service: any = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** An RLS-enforced client signed in as the given account. */
async function asUser(creds: { email: string; password: string }) {
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword(creds);
  if (error || !data.user) {
    throw new Error(`sign-in failed for ${creds.email}: ${error?.message}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, userId: data.user.id };
}

describe.skipIf(!LOCAL_UP)("platform admin authorization", () => {
  beforeAll(() => {
    if (!LOCAL_UP) {
      console.warn(
        `[admin-authorization] SKIPPED — local Supabase not reachable at ${URL}. ` +
          `Start it with: npm run db:start && npm run db:reset`
      );
    }
  });

  // ── 1. Who holds the flag ────────────────────────────────────────────────

  it("grants admin to exactly one account, and it is owner@dentgrow.local", async () => {
    const { data } = await service
      .from("profiles")
      .select("id, role, clinic_id, is_admin")
      .eq("is_admin", true);

    expect(data).toHaveLength(1);

    const { data: users } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
    const owner = users.users.find(
      (u: { email?: string | null }) =>
        (u.email ?? "").toLowerCase() === ADMIN.email
    );

    expect(owner, "owner@dentgrow.local should exist").toBeTruthy();
    expect(data[0].id).toBe(owner.id);
  });

  it("keeps the admin's existing role and clinic — admin is additive", async () => {
    // The whole reason admin is a separate column rather than a new value in
    // the user_role enum: this account is also the dentist of the development
    // clinic, and losing that would break Business Brain access.
    const { data: users } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
    const owner = users.users.find(
      (u: { email?: string | null }) =>
        (u.email ?? "").toLowerCase() === ADMIN.email
    );

    const { data: profile } = await service
      .from("profiles")
      .select("role, clinic_id, is_admin")
      .eq("id", owner.id)
      .single();

    expect(profile.is_admin).toBe(true);
    expect(profile.role).toBe("dentist");
    expect(profile.clinic_id).toBe(MY_CLINIC);
  });

  it("leaves every other seeded account untouched", async () => {
    const expected: [typeof DENTIST, string, string][] = [
      [DENTIST, "dentist", LIYING_CLINIC],
      [RECEPTIONIST, "receptionist", LIYING_CLINIC],
      [PATIENT, "patient", LIYING_CLINIC],
    ];

    for (const [creds, role, clinic] of expected) {
      const { userId } = await asUser(creds);
      const { data } = await service
        .from("profiles")
        .select("role, clinic_id, is_admin")
        .eq("id", userId)
        .single();

      expect(data.role, `${creds.email} role`).toBe(role);
      expect(data.clinic_id, `${creds.email} clinic`).toBe(clinic);
      expect(data.is_admin, `${creds.email} must not be admin`).toBe(false);
    }
  });

  // ── 2. The flag cannot be self-granted ───────────────────────────────────

  for (const [label, creds] of [
    ["a dentist", DENTIST],
    ["a receptionist", RECEPTIONIST],
    ["a patient", PATIENT],
  ] as const) {
    it(`refuses ${label} trying to grant itself admin`, async () => {
      const { client, userId } = await asUser(creds);

      // This is the exact request an attacker holding the public anon key
      // would send. RLS must refuse it.
      const { error } = await client
        .from("profiles")
        .update({ is_admin: true })
        .eq("id", userId);

      expect(error, "the escalation must be rejected").toBeTruthy();

      // And nothing changed, whatever the API reported.
      const { data } = await service
        .from("profiles")
        .select("is_admin")
        .eq("id", userId)
        .single();
      expect(data.is_admin).toBe(false);
    });
  }

  it("still refuses role escalation and clinic reassignment", async () => {
    // Regression guard for 20260727000000: amending the policy's WITH CHECK to
    // pin is_admin must not have dropped the pins that were already there.
    const { client, userId } = await asUser(RECEPTIONIST);

    const roleAttempt = await client
      .from("profiles")
      .update({ role: "dentist" })
      .eq("id", userId);
    expect(roleAttempt.error).toBeTruthy();

    const clinicAttempt = await client
      .from("profiles")
      .update({ clinic_id: MY_CLINIC })
      .eq("id", userId);
    expect(clinicAttempt.error).toBeTruthy();

    const { data } = await service
      .from("profiles")
      .select("role, clinic_id")
      .eq("id", userId)
      .single();
    expect(data.role).toBe("receptionist");
    expect(data.clinic_id).toBe(LIYING_CLINIC);
  });

  it("still allows the harmless self-service edits it always allowed", async () => {
    // The policy must constrain authorisation columns without turning the
    // profile read-only — signature and display name are edited in the app.
    const { client, userId } = await asUser(DENTIST);

    const { data: before } = await service
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();

    const { error } = await client
      .from("profiles")
      .update({ full_name: "Dr. Liying (edited)" })
      .eq("id", userId);
    expect(error).toBeNull();

    // Restore.
    await service
      .from("profiles")
      .update({ full_name: before.full_name })
      .eq("id", userId);
  });

  // ── 3. auth_is_admin() ───────────────────────────────────────────────────

  it("auth_is_admin() answers for the caller only", async () => {
    const admin = await asUser(ADMIN);
    const { data: isAdmin, error: adminErr } = await admin.client.rpc("auth_is_admin");
    expect(adminErr).toBeNull();
    expect(isAdmin).toBe(true);

    const dentist = await asUser(DENTIST);
    const { data: notAdmin } = await dentist.client.rpc("auth_is_admin");
    expect(notAdmin).toBe(false);
  });

  // ── 4. Tenant isolation is unchanged ─────────────────────────────────────

  it("does not let the admin's clinic see another clinic's patients through RLS", async () => {
    // Admin is a sign-in door, not an RLS bypass. The owner account reads data
    // exactly as the dentist of its own clinic does.
    const { client } = await asUser(ADMIN);

    const { data } = await client.from("patients").select("id, clinic_id");
    const foreign = (data ?? []).filter(
      (p: { clinic_id: string }) => p.clinic_id !== MY_CLINIC
    );

    expect(foreign, "admin must not read other clinics through RLS").toEqual([]);
  });

  it("keeps clinic A out of clinic B", async () => {
    const { client } = await asUser(DENTIST); // Dr. Liying's Dental Care

    const { data } = await client.from("patients").select("id, clinic_id");
    const foreign = (data ?? []).filter(
      (p: { clinic_id: string }) => p.clinic_id !== LIYING_CLINIC
    );

    expect(foreign).toEqual([]);
  });
});
