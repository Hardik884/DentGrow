/**
 * actions/__tests__/consents-rls.spec.ts
 *
 * DB-level security tests for Patient Consent Forms, exercised through the
 * authenticated (RLS-enforced) client — the guarantees that protect signed
 * documents and tenant isolation:
 *   - a SIGNED consent is immutable (RLS refuses UPDATE),
 *   - a dentist in clinic A cannot see clinic B's consents,
 *   - a dentist sees their own clinic's consents.
 *
 * Follows the repo convention: reachability guard + describe.skipIf, fixed
 * namespaced UUIDs, and afterAll cleanup (see billing-charges.spec.ts).
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
const BRAIN = { email: "brain@dentgrow.test", password: "password123" }; // My Dental Clinic
const LIYING = { email: "dentist@dentgrow.test", password: "password123" }; // Dr. Liying's clinic
const MY_CLINIC = "00000000-0000-0000-0000-000000000001";
const PATIENT_ASHA = "b0000000-0000-4000-8000-000000000001";

const SIGNED_ID = "c5100000-0000-0000-0000-000000000001";
const DRAFT_ID = "c5100000-0000-0000-0000-000000000002";

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
const service = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } }) as any;

function snapshot() {
  return {
    templateKey: "root_canal",
    templateName: "Root Canal Treatment Consent",
    templateVersion: 1,
    content: { sections: [], disclaimer: "Review before use." },
    patient: { name: "Asha Menon", phone: "9990000001", age: 40 },
    treatment: { type: "Root Canal Treatment" },
    clinic: { name: "My Dental Clinic", address: null, phone: null, email: null, registrationNumber: null },
    dentist: { name: "Dr. Demo", signatureUrl: null },
    frozenAt: new Date().toISOString(),
  };
}

describe.skipIf(!LOCAL_UP)("consent RLS + immutability", () => {
  beforeAll(async () => {
    await service.from("consents").delete().in("id", [SIGNED_ID, DRAFT_ID]);
    await service.from("consents").insert([
      {
        id: SIGNED_ID,
        clinic_id: MY_CLINIC,
        patient_id: PATIENT_ASHA,
        template_key: "root_canal",
        template_name: "Root Canal Treatment Consent",
        template_version: 1,
        source: "digital",
        status: "signed",
        content_snapshot: snapshot(),
        patient_signed_name: "Asha Menon",
        patient_signature: "data:image/png;base64,AAAA",
        signed_at: new Date().toISOString(),
      },
      {
        id: DRAFT_ID,
        clinic_id: MY_CLINIC,
        patient_id: PATIENT_ASHA,
        template_key: "root_canal",
        template_name: "Root Canal Treatment Consent",
        template_version: 1,
        source: "digital",
        status: "draft",
        content_snapshot: snapshot(),
      },
    ]);
  });

  afterAll(async () => {
    await service.from("consents").delete().in("id", [SIGNED_ID, DRAFT_ID]);
  });

  it("a signed consent is immutable — the dentist's UPDATE affects no rows", async () => {
    const brain = createClient(URL, ANON, { auth: { persistSession: false } });
    const auth = await brain.auth.signInWithPassword(BRAIN);
    expect(auth.error).toBeNull();

    const { data } = await brain
      .from("consents")
      .update({ template_name: "TAMPERED" })
      .eq("id", SIGNED_ID)
      .select("id");
    // RLS update predicate excludes status='signed' → zero rows updated.
    expect(data ?? []).toHaveLength(0);

    // Confirm the stored row is untouched.
    const { data: after } = await service
      .from("consents")
      .select("template_name, status")
      .eq("id", SIGNED_ID)
      .single();
    expect(after.template_name).toBe("Root Canal Treatment Consent");
    expect(after.status).toBe("signed");
  });

  it("a dentist can read their own clinic's consents", async () => {
    const brain = createClient(URL, ANON, { auth: { persistSession: false } });
    await brain.auth.signInWithPassword(BRAIN);
    const { data } = await brain.from("consents").select("id").eq("id", DRAFT_ID);
    expect((data ?? []).length).toBe(1);
  });

  it("a dentist in another clinic cannot see this clinic's consent", async () => {
    const other = createClient(URL, ANON, { auth: { persistSession: false } });
    const auth = await other.auth.signInWithPassword(LIYING);
    expect(auth.error).toBeNull();
    const { data } = await other.from("consents").select("id").eq("id", SIGNED_ID);
    expect(data ?? []).toHaveLength(0);
  });

  it("a dentist in another clinic cannot UPDATE this clinic's consent", async () => {
    const other = createClient(URL, ANON, { auth: { persistSession: false } });
    await other.auth.signInWithPassword(LIYING);
    const { data } = await other
      .from("consents")
      .update({ template_name: "X" })
      .eq("id", DRAFT_ID)
      .select("id");
    expect(data ?? []).toHaveLength(0);
    const { data: after } = await service
      .from("consents")
      .select("template_name")
      .eq("id", DRAFT_ID)
      .single();
    expect(after.template_name).toBe("Root Canal Treatment Consent");
  });
});
