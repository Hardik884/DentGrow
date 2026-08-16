/**
 * lib/consents/__tests__/flag.spec.ts
 *
 * Verifies isConsentFormsEnabled reads the real per-clinic pilot flag
 * (clinic_settings.consent_forms_enabled) correctly against a live local
 * Supabase — the pilot clinic (Clinic B) is on, Dr. Liying's clinic is off.
 * Follows the repo's DB-integration convention: reachability guard +
 * describe.skipIf, no mutation (read-only against seeded/migration data).
 */

import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { isConsentFormsEnabled } from "@/lib/consents/flag";

const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:55321";
const ANON =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const CLINIC_B = "22222222-2222-2222-2222-222222222222"; // pilot clinic — enabled
const MY_DENTAL_CLINIC = "00000000-0000-0000-0000-000000000001"; // pilot clinic — enabled
const LIYING_CLINIC = "11111111-1111-1111-1111-111111111111"; // not yet enabled

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${URL}/rest/v1/`, { headers: { apikey: ANON } });
    return res.ok || res.status === 404 || res.status === 400;
  } catch {
    return false;
  }
}
const LOCAL_UP = await reachable();

// isConsentFormsEnabled is always called by server actions with a caller's
// own authenticated, RLS-scoped session client. The service-role client used
// here is a stand-in that reproduces the same read (clinic_settings RLS would
// otherwise block an unauthenticated anon read and mask the flag's real
// value) — it exercises the query/column logic identically.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as any;

describe.skipIf(!LOCAL_UP)("isConsentFormsEnabled (pilot rollout flag)", () => {
  it("is enabled for the pilot clinics (Clinic B and My Dental Clinic)", async () => {
    expect(await isConsentFormsEnabled(db, CLINIC_B)).toBe(true);
    expect(await isConsentFormsEnabled(db, MY_DENTAL_CLINIC)).toBe(true);
  });

  it("is NOT enabled for Dr. Liying's Dental Care", async () => {
    expect(await isConsentFormsEnabled(db, LIYING_CLINIC)).toBe(false);
  });

  it("defaults to false for a clinic with no clinic_settings row", async () => {
    expect(await isConsentFormsEnabled(db, "99999999-9999-9999-9999-999999999999")).toBe(false);
  });
});
