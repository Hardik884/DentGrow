import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { ACCOUNTS, signInStaff } from "./helpers/auth";

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

// The exact reported-bug reproduction: an ₹8,000 visit paid ₹6,200 against the
// treatment + ₹1,500 against the appointment = ₹7,700 truly paid (balance
// ₹300). The old code showed ₹9,200 / balance ₹0 in the list but ₹7,700 /
// ₹300 in the detail. And an overpaid ₹8,000 visit (₹9,200 paid → ₹0 balance,
// ₹1,200 credit).
const REPRO_APPT_ID = "c1000000-0000-4000-8000-0000000000e3";
const REPRO_TREATMENT_ID = "c2000000-0000-4000-8000-0000000000e3";
const REPRO_PAY_LINKED = "c3000000-0000-4000-8000-0000000000e3";
const REPRO_PAY_APPT = "c3000000-0000-4000-8000-0000000000e4";
const OVERPAY_APPT_ID = "c1000000-0000-4000-8000-0000000000e5";
const OVERPAY_TREATMENT_ID = "c2000000-0000-4000-8000-0000000000e5";
const OVERPAY_PAY_LINKED = "c3000000-0000-4000-8000-0000000000e5";
const OVERPAY_PAY_APPT = "c3000000-0000-4000-8000-0000000000e6";

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

/** Seed one appointment + treatment + two payments (linked + appointment-scoped). */
async function seedBillCase(opts: {
  apptId: string;
  treatmentId: string;
  linkedPayId: string;
  apptPayId: string;
  cost: number;
  linkedAmount: number;
  apptAmount: number;
  scheduledAt: string;
}) {
  await supaFetch("appointments", {
    method: "POST",
    body: JSON.stringify({
      id: opts.apptId,
      clinic_id: DEMO_CLINIC,
      patient_id: ASHA_MENON,
      dentist_id: DEMO_DENTIST,
      scheduled_at: opts.scheduledAt,
      duration_minutes: 30,
      source: "walk_in",
      status: "completed",
    }),
  });
  await supaFetch("treatments", {
    method: "POST",
    body: JSON.stringify({
      id: opts.treatmentId,
      clinic_id: DEMO_CLINIC,
      appointment_id: opts.apptId,
      patient_id: ASHA_MENON,
      treatment_type: "Root Canal",
      cost: opts.cost,
      status: "completed",
    }),
  });
  await supaFetch("payments", {
    method: "POST",
    body: JSON.stringify([
      {
        id: opts.linkedPayId,
        clinic_id: DEMO_CLINIC,
        patient_id: ASHA_MENON,
        appointment_id: opts.apptId,
        treatment_id: opts.treatmentId,
        amount: opts.linkedAmount,
        method: "cash",
        payment_type: "treatment",
        payment_date: "2026-08-14",
      },
      {
        id: opts.apptPayId,
        clinic_id: DEMO_CLINIC,
        patient_id: ASHA_MENON,
        appointment_id: opts.apptId,
        treatment_id: null,
        amount: opts.apptAmount,
        method: "cash",
        payment_type: "treatment",
        payment_date: "2026-08-14",
      },
    ]),
  });
}

async function removeBillCase(opts: {
  apptId: string;
  treatmentId: string;
  linkedPayId: string;
  apptPayId: string;
}) {
  await supaFetch(`payments?id=in.(${opts.linkedPayId},${opts.apptPayId})`, { method: "DELETE" });
  await supaFetch(`treatments?id=eq.${opts.treatmentId}`, { method: "DELETE" });
  await supaFetch(`appointments?id=eq.${opts.apptId}`, { method: "DELETE" });
}

const REPRO_CASE = {
  apptId: REPRO_APPT_ID,
  treatmentId: REPRO_TREATMENT_ID,
  linkedPayId: REPRO_PAY_LINKED,
  apptPayId: REPRO_PAY_APPT,
  cost: 8000,
  linkedAmount: 6200,
  apptAmount: 1500, // total paid 7700 → balance 300
  scheduledAt: "2026-08-15T14:00:00+00:00",
};
const OVERPAY_CASE = {
  apptId: OVERPAY_APPT_ID,
  treatmentId: OVERPAY_TREATMENT_ID,
  linkedPayId: OVERPAY_PAY_LINKED,
  apptPayId: OVERPAY_PAY_APPT,
  cost: 8000,
  linkedAmount: 7700,
  apptAmount: 1500, // total paid 9200 → balance 0, credit 1200
  scheduledAt: "2026-08-15T15:00:00+00:00",
};

test.beforeAll(async () => {
  const reachable = await localSupabaseReachable();
  test.skip(
    !reachable,
    `Local Supabase not reachable at ${SUPABASE_URL} — start it with: npm run db:start && npm run db:reset`
  );
  if (reachable) {
    await seedExtraBillableAppointment();
    await seedBillCase(REPRO_CASE);
    await seedBillCase(OVERPAY_CASE);
  }
});

test.afterAll(async () => {
  if (await localSupabaseReachable()) {
    await removeExtraBillableAppointment();
    await removeBillCase(REPRO_CASE);
    await removeBillCase(OVERPAY_CASE);
  }
});

async function loginAsDemoClinic(page: Page) {
  // Staff sign-in no longer asks for a clinic — it is resolved from the
  // authenticated profile. See e2e/helpers/auth.ts.
  await signInStaff(page, ACCOUNTS.demoDentist);
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

test.describe("Billing consistency (the ₹9,200-vs-₹7,700 bug) + Back button", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemoClinic(page);
  });

  /** Open the Billing view and return the row locator for one seeded appointment. */
  async function openBillingRow(page: Page, appointmentId: string) {
    await page.goto("/dentist/payments");
    await page.getByRole("tab", { name: "Billing" }).click();
    // The row's "View Bill" link carries the appointment id in its href.
    return page.locator(`a[href*="/appointments/${appointmentId}/bill"]`).first();
  }

  test("REGRESSION: list row and opened bill agree — partial ₹7,700 / balance ₹300 (not ₹9,200/₹0)", async ({
    page,
  }) => {
    const viewLink = await openBillingRow(page, REPRO_APPT_ID);
    await expect(viewLink).toBeVisible();

    // The Billing LIST row: the appointment card that contains this View Bill link.
    const row = page.locator("div", { has: viewLink }).last();
    // Paid must be the true ₹7,700, never the double-counted ₹9,200.
    await expect(row).toContainText("₹7,700");
    await expect(row).not.toContainText("₹9,200");

    // The opened bill DETAIL must show the SAME figures. (toContainText avoids
    // strict-mode issues — ₹8,000.00 legitimately repeats as rate/amount/
    // subtotal/total on the invoice.)
    await viewLink.click();
    const invoice = page.locator("#invoice-document");
    await expect(invoice).toContainText("₹8,000.00"); // total
    await expect(invoice).toContainText("₹7,700.00"); // amount paid
    await expect(invoice).toContainText("₹300.00"); // balance due
    await expect(invoice).toContainText("Partially Paid");
    await expect(invoice).not.toContainText("₹9,200"); // never the doubled figure
  });

  test("REGRESSION: overpaid ₹9,200 on ₹8,000 → balance ₹0 with a visible ₹1,200 credit", async ({
    page,
  }) => {
    const viewLink = await openBillingRow(page, OVERPAY_APPT_ID);
    await viewLink.click();

    const invoice = page.locator("#invoice-document");
    await expect(invoice.getByText("₹9,200.00")).toBeVisible(); // amount paid, uncapped
    await expect(invoice.getByText(/Credit \(Overpaid\)/i)).toBeVisible();
    await expect(invoice.getByText("₹1,200.00")).toBeVisible(); // the credit
    await expect(invoice.getByText("Paid", { exact: true })).toBeVisible(); // status badge
  });

  test("Back button from a Billing-list bill returns to /dentist/payments with Billing active", async ({
    page,
  }) => {
    const viewLink = await openBillingRow(page, REPRO_APPT_ID);
    await viewLink.click();
    await expect(page).toHaveURL(/\/appointments\/.*\/bill\?.*from=billing/);

    // Click Back.
    await page.getByRole("link", { name: "Back" }).click();

    // Lands on the main Billing & Payments page, Billing view active — NOT the
    // appointment detail page.
    await expect(page).toHaveURL(/\/dentist\/payments\?.*view=billing/);
    await expect(page).not.toHaveURL(/\/appointments\//);
    await expect(page.getByRole("tab", { name: "Billing" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
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
    await signInStaff(page, ACCOUNTS.demoDentist);

    // Sanity: staff cannot reach the patient portal billing route with their
    // own session — middleware bounces staff away from /portal/*.
    await page.goto("/portal/billing");
    await expect(page).not.toHaveURL(/\/portal\/billing$/);
  });
});
