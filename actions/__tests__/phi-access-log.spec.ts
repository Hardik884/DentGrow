/**
 * actions/__tests__/phi-access-log.spec.ts
 *
 * Integration guard for the PHI read-access audit log
 * (20260903000000_phi_access_log.sql).
 *
 * An audit log is only evidence if three things hold, and each is asserted
 * here against a real Postgres rather than reasoned about:
 *
 *   1. TENANT ISOLATION — one clinic cannot read another clinic's access trail.
 *      A log that leaks across tenants is a directory of who treats whom.
 *   2. IMMUTABILITY — nobody, including the service role that writes it, can
 *      alter or quietly remove a row. Staff must not be able to erase the
 *      record that they opened a chart.
 *   3. NO ANONYMOUS ACCESS — the relation is not readable with the public key,
 *      which is precisely the mistake the five soft-delete views made.
 *
 * Follows the repo's integration convention: reachability guard,
 * describe.skipIf, seeded accounts, fixed namespaced UUIDs, afterAll cleanup.
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
const LIYING = "dentist@dentgrow.test"; // dentist, Dr. Liying's Dental Care
const RECEPTIONIST = "receptionist@dentgrow.test"; // Dr. Liying's Dental Care
const PATIENT = "patient@dentgrow.test"; // portal patient

const MY_CLINIC = "00000000-0000-0000-0000-000000000001";
const LIYING_CLINIC = "00000000-0000-0000-0000-000000000000";

// Namespaced so a failed run leaves nothing that collides with real rows.
const ROW_MY_CLINIC = "d1000000-0000-4000-8000-000000000001";
const ROW_LIYING = "d1000000-0000-4000-8000-000000000002";

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

/** Raw PostgREST call as a given bearer token (or anon when token is null). */
async function request(
  path: string,
  token: string | null,
  init: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: ANON,
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers });
}

async function idsVisibleTo(token: string | null): Promise<string[]> {
  const res = await request("phi_access_log?select=id", token);
  if (!res.ok) return [];
  const rows = (await res.json()) as { id: string }[];
  return rows.map((r) => r.id);
}

async function profileIdFor(email: string): Promise<string> {
  const { data } = await service
    .from("profiles")
    .select("id, clinic_id")
    .limit(1000);
  // profiles has no email column; resolve through auth.users via the service
  // client's admin API instead.
  const { data: users } = await service.auth.admin.listUsers();
  const user = (users?.users ?? []).find(
    (u: { email?: string }) => u.email === email
  );
  if (!user) throw new Error(`no auth user for ${email}`);
  void data;
  return user.id as string;
}

describe.skipIf(!LOCAL_UP)("phi_access_log", () => {
  let brain = "";
  let liying = "";
  let receptionist = "";
  let patient = "";

  beforeAll(async () => {
    [brain, liying, receptionist, patient] = await Promise.all([
      tokenFor(BRAIN),
      tokenFor(LIYING),
      tokenFor(RECEPTIONIST),
      tokenFor(PATIENT),
    ]);

    const brainActor = await profileIdFor(BRAIN);
    const liyingActor = await profileIdFor(LIYING);

    // One row per clinic, so "cannot see the other clinic's rows" is proven
    // against a row that actually exists rather than against an empty table.
    await service.from("phi_access_log").delete().in("id", [ROW_MY_CLINIC, ROW_LIYING]);
    const { error } = await service.from("phi_access_log").insert([
      {
        id: ROW_MY_CLINIC,
        clinic_id: MY_CLINIC,
        actor_id: brainActor,
        actor_role: "dentist",
        event: "PATIENT_VIEWED",
        resource_type: "patient",
        context: { surface: "spec" },
      },
      {
        id: ROW_LIYING,
        clinic_id: LIYING_CLINIC,
        actor_id: liyingActor,
        actor_role: "dentist",
        event: "PATIENT_VIEWED",
        resource_type: "patient",
        context: { surface: "spec" },
      },
    ]);
    if (error) throw new Error(`seed failed: ${error.message}`);
  });

  afterAll(async () => {
    if (!LOCAL_UP) return;
    // The immutability trigger blocks DELETE outside a retention purge, so the
    // spec's own rows are removed the same way the retention job would.
    await service.rpc("purge_phi_access_log_rows", {
      p_ids: [ROW_MY_CLINIC, ROW_LIYING],
    });
  });

  // ── 3. NO ANONYMOUS ACCESS ────────────────────────────────────────────────

  it("is invisible to an unauthenticated caller", async () => {
    expect(await idsVisibleTo(null)).toEqual([]);
  });

  it("cannot be written by an unauthenticated caller", async () => {
    const res = await request("phi_access_log", null, {
      method: "POST",
      body: JSON.stringify({
        clinic_id: MY_CLINIC,
        actor_role: "dentist",
        event: "PATIENT_VIEWED",
        resource_type: "patient",
      }),
    });
    expect(res.ok).toBe(false);
  });

  // ── 1. TENANT ISOLATION ───────────────────────────────────────────────────

  it("shows a dentist their own clinic's rows and nothing else", async () => {
    const seen = await idsVisibleTo(brain);
    expect(seen).toContain(ROW_MY_CLINIC); // non-vacuous: they see something
    expect(seen).not.toContain(ROW_LIYING); // and not the other clinic's
  });

  it("shows the other clinic's dentist the mirror image", async () => {
    const seen = await idsVisibleTo(liying);
    expect(seen).toContain(ROW_LIYING);
    expect(seen).not.toContain(ROW_MY_CLINIC);
  });

  // ── ROLE BOUNDARY ─────────────────────────────────────────────────────────

  it("is not readable by a receptionist — their own reads are recorded in it", async () => {
    expect(await idsVisibleTo(receptionist)).toEqual([]);
  });

  it("is not readable by a portal patient", async () => {
    expect(await idsVisibleTo(patient)).toEqual([]);
  });

  // ── 2. IMMUTABILITY ───────────────────────────────────────────────────────

  it("cannot be modified by a dentist who can read it", async () => {
    const res = await request(`phi_access_log?id=eq.${ROW_MY_CLINIC}`, brain, {
      method: "PATCH",
      body: JSON.stringify({ event: "PATIENT_SEARCHED" }),
    });
    expect(res.ok).toBe(false);

    const { data } = await service
      .from("phi_access_log")
      .select("event")
      .eq("id", ROW_MY_CLINIC)
      .single();
    expect(data.event).toBe("PATIENT_VIEWED");
  });

  it("cannot be deleted by a dentist who can read it", async () => {
    const res = await request(`phi_access_log?id=eq.${ROW_MY_CLINIC}`, brain, {
      method: "DELETE",
    });
    expect(res.ok).toBe(false);

    const { data } = await service
      .from("phi_access_log")
      .select("id")
      .eq("id", ROW_MY_CLINIC)
      .maybeSingle();
    expect(data?.id).toBe(ROW_MY_CLINIC);
  });

  it("cannot be modified even by the SERVICE ROLE — RLS cannot constrain it, the trigger can", async () => {
    const { error } = await service
      .from("phi_access_log")
      .update({ event: "PATIENT_SEARCHED" })
      .eq("id", ROW_MY_CLINIC);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/append-only/i);
  });

  it("cannot be deleted by the service role outside a declared retention purge", async () => {
    const { error } = await service
      .from("phi_access_log")
      .delete()
      .eq("id", ROW_MY_CLINIC);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/retention purge/i);
  });
});
