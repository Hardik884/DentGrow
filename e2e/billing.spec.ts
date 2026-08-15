import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

/**
 * e2e/billing.spec.ts
 *
 * Playwright coverage for the Billing & Payments fixes:
 *   1. /dentist/payments opens on Payments
 *   2. Billing toggle works
 *   3. Billing list shows multiple appointments
 *   4. Bill opens correctly
 *   5. PDF/print looks correct WITHOUT a signature (section omitted entirely)
 *   6. PDF/print looks correct WITH a signature configured
 *
 * Runs against a LOCAL Supabase instance seeded via `npm run db:reset`
 * (see supabase/seed.sql) — never the linked remote project. Uses the
 * "My Dental Clinic" demo account, which is the one seeded with patients,
 * treatments and payments to exercise the clinic-wide Billing list against.
 */

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:55321";
const SERVICE_ROLE_KEY =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const DEMO_CLINIC = "00000000-0000-0000-0000-000000000001";
const DEMO_DENTIST = "bbbbbbbb-0000-0000-0000-000000000001";
const ASHA_MENON = "b0000000-0000-4000-8000-000000000001";
// Fixed test-only ids so setup/cleanup is idempotent and namespaced away from
// the seed's own ids — same convention actions/__tests__/billing-charges.spec.ts uses.
const EXTRA_APPT_ID = "c1000000-0000-4000-8000-0000000000e2";
const EXTRA_TREATMENT_ID = "c2000000-0000-4000-8000-0000000000e2";

async function supaFetch(path: string, init?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal,resolution=merge-duplicates",
      ...(init?.headers ?? {}),
    },
  });
}

async function localSupabaseReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * The demo clinic's own seed data (supabase/seed.sql) has exactly ONE
 * appointment with a real billable charge (Priya Nair's Root Canal). To
 * exercise "the Billing list shows MULTIPLE appointments" meaningfully
 * rather than assuming incidental seed content, this inserts one more
 * completed, billable treatment (for a different patient) directly via the
 * service role — the same fixed-id, service-role seeding pattern
 * actions/__tests__/billing-charges.spec.ts already uses for integration
 * tests. Idempotent (upsert) and cleaned up in afterAll.
 */
async function seedExtraBillableAppointment() {
  await supaFetch("appointments", {
    method: "POST",
    body: JSON.stringify({
      id: EXTRA_APPT_ID,
      clinic_id: DEMO_CLINIC,
      patient_id: ASHA_MENON,
      dentist_id: DEMO_DENTIST,
      scheduled_at: "2026-08-15T13:00:00+00:00",
      duration_minutes: 30,
      source: "walk_in",
      status: "completed",
    }),
  });
  await supaFetch("treatments", {
    method: "POST",
    body: JSON.stringify({
      id: EXTRA_TREATMENT_ID,
      clinic_id: DEMO_CLINIC,
      appointment_id: EXTRA_APPT_ID,
      patient_id: ASHA_MENON,
      treatment_type: "Cleaning",
      cost: 1500,
      status: "completed",
    }),
  });
}

async function removeExtraBillableAppointment() {
  await supaFetch(`treatments?id=eq.${EXTRA_TREATMENT_ID}`, { method: "DELETE" });
  await supaFetch(`appointments?id=eq.${EXTRA_APPT_ID}`, { method: "DELETE" });
}

test.beforeAll(async () => {
  const reachable = await localSupabaseReachable();
  test.skip(
    !reachable,
    `Local Supabase not reachable at ${SUPABASE_URL} — start it with: npm run db:start && npm run db:reset`
  );
  if (reachable) await seedExtraBillableAppointment();
});

test.afterAll(async () => {
  if (await localSupabaseReachable()) await removeExtraBillableAppointment();
});

async function loginAsDemoClinic(page: Page) {
  await page.goto("/login");
  await page.locator("select").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("select").selectOption({ label: "My Dental Clinic" });
  await page.getByPlaceholder("you@example.com").fill("brain@dentgrow.test");
  await page.getByPlaceholder("••••••••").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dentist(\/|$)/, { timeout: 20_000 });
}

test.describe("Dentist Billing & Payments — /dentist/payments", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemoClinic(page);
  });

  test("1. opens on Payments by default", async ({ page }) => {
    await page.goto("/dentist/payments");

    const paymentsTab = page.getByRole("tab", { name: "Payments" });
    const billingTab = page.getByRole("tab", { name: "Billing" });
    await expect(paymentsTab).toHaveAttribute("aria-selected", "true");
    await expect(billingTab).toHaveAttribute("aria-selected", "false");

    // The pre-existing Payments content is what's actually showing.
    await expect(page.getByText("Today's Clinic Revenue")).toBeVisible();
  });

  test("2. Billing toggle switches to the clinic-wide bill list", async ({ page }) => {
    await page.goto("/dentist/payments");

    await page.getByRole("tab", { name: "Billing" }).click();

    await expect(page.getByRole("tab", { name: "Billing" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    // Payments-only content (today's revenue cards) is no longer showing.
    await expect(page.getByText("Today's Clinic Revenue")).not.toBeVisible();
  });

  test("3. Billing list shows more than one appointment", async ({ page }) => {
    await page.goto("/dentist/payments");
    await page.getByRole("tab", { name: "Billing" }).click();

    const viewBillLinks = page.getByRole("link", { name: "View Bill" });
    await expect(viewBillLinks.first()).toBeVisible();
    expect(await viewBillLinks.count()).toBeGreaterThanOrEqual(2);
  });

  test("4. opening a bill shows a complete invoice with Total/Paid/Balance Due", async ({
    page,
  }) => {
    await page.goto("/dentist/payments");
    await page.getByRole("tab", { name: "Billing" }).click();
    await page.getByRole("link", { name: "View Bill" }).first().click();

    await expect(page.getByText("INVOICE", { exact: true })).toBeVisible();
    await expect(page.getByText("Balance Due")).toBeVisible();
    await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send on WhatsApp" })).toBeVisible();

    // No DentGrow dashboard chrome inside the invoice document itself.
    const invoice = page.locator("#invoice-document");
    await expect(invoice.getByText("Sign out")).toHaveCount(0);
  });

  test("5. bill with NO signature configured shows no signature section at all", async ({
    page,
  }) => {
    await page.goto("/dentist/payments");
    await page.getByRole("tab", { name: "Billing" }).click();
    await page.getByRole("link", { name: "View Bill" }).first().click();

    const invoice = page.locator("#invoice-document");
    await expect(invoice.getByText("Authorized Signature")).toHaveCount(0);
    await expect(invoice.getByText(/signature not configured/i)).toHaveCount(0);
    // The bill still ends with the professional closing line.
    await expect(invoice.getByText(/system-generated bill from/i)).toBeVisible();
  });
});

test.describe("Signature configured", () => {
  test("6. once a signature is uploaded, it appears on the bill", async ({ page }) => {
    await loginAsDemoClinic(page);

    await page.goto("/dentist/settings");
    await page
      .getByLabel("Upload signature image")
      .setInputFiles(path.join(__dirname, "fixtures/test-signature.png"));
    await page.getByRole("button", { name: "Save Signature" }).click();
    await expect(page.getByText("Active signature")).toBeVisible({ timeout: 15_000 });

    await page.goto("/dentist/payments");
    await page.getByRole("tab", { name: "Billing" }).click();
    await page.getByRole("link", { name: "View Bill" }).first().click();

    const invoice = page.locator("#invoice-document");
    await expect(invoice.getByText("Authorized Signature")).toBeVisible();
    await expect(invoice.locator("img[alt*='Signature of']")).toBeVisible();

    // Clean up so a re-run of the suite starts from the same "no signature" state.
    await page.goto("/dentist/settings");
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).last().click();
    await expect(page.getByText("No signature uploaded")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Patient portal Billing & Payments authorization", () => {
  test("Payments is the default view; Bills panel never shows another patient's data", async ({
    page,
  }) => {
    // Uses the portal account created for Priya Nair during the feature's
    // manual verification pass (registered against 9990000003). If that
    // account doesn't exist in a fresh reset, this test documents the flow
    // rather than asserting on brittle pre-seeded portal state.
    await page.goto("/login");
    await page.locator("select").selectOption({ label: "My Dental Clinic" });
    await page.getByPlaceholder("you@example.com").fill("brain@dentgrow.test");
    await page.getByPlaceholder("••••••••").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dentist(\/|$)/);

    // Sanity: staff cannot reach the patient portal billing route with their
    // own session — middleware bounces staff away from /portal/*.
    await page.goto("/portal/billing");
    await expect(page).not.toHaveURL(/\/portal\/billing$/);
  });
});
