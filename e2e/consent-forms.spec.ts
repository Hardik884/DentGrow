import { test, expect, type Page } from "@playwright/test";

/**
 * e2e/consent-forms.spec.ts
 *
 * Playwright coverage for Patient Consent Forms:
 *   1. Consent Forms tab lists the patient's consents, labelled by source.
 *   2. Viewing a digital consent renders the A4 consent document.
 *   3. The treatment form shows the inline "Consent Form Required?" toggle and
 *      auto-selects a template on "Yes".
 *   4. The Upload Signed Consent dialog opens with a template picker.
 *
 * Runs against a LOCAL Supabase (npm run db:reset), "My Dental Clinic" demo
 * account. Seeds consents directly via the service role, fixed namespaced ids,
 * cleaned up in afterAll — mirroring e2e/billing.spec.ts.
 */

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:55321";
const SERVICE_ROLE_KEY =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const DEMO_CLINIC = "00000000-0000-0000-0000-000000000001";
const ASHA_MENON = "b0000000-0000-4000-8000-000000000001";
const SIGNED_DIGITAL = "c6000000-0000-4000-8000-0000000000c1";
const UPLOADED = "c6000000-0000-4000-8000-0000000000c2";

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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { signal: AbortSignal.timeout(3000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

function snapshot(templateName: string) {
  return {
    templateKey: "root_canal",
    templateName,
    templateVersion: 1,
    content: {
      sections: [
        { key: "diagnosis", title: "Diagnosis / Reason for Treatment", body: "Root canal recommended for tooth 26.", editablePerConsent: true },
        { key: "voluntary", title: "Voluntary Consent", body: "I give my consent to this treatment voluntarily.", editablePerConsent: false },
      ],
      disclaimer: "This consent form documents the informed-consent discussion and should be reviewed by the clinic.",
    },
    patient: { name: "Asha Menon", phone: "9990000001", age: 41 },
    treatment: { type: "Root Canal Treatment" },
    clinic: { name: "My Dental Clinic", address: "1 Demo Road", phone: null, email: null, registrationNumber: null },
    dentist: { name: "Dr. Demo", signatureUrl: null },
    frozenAt: new Date().toISOString(),
  };
}

async function seed() {
  // Seed as two SEPARATE inserts: a PostgREST batch insert requires every row
  // to share the same column set, but the digital row (patient_signature) and
  // the uploaded row (file_*) intentionally differ.
  await supaFetch("consents", {
    method: "POST",
    body: JSON.stringify({
      id: SIGNED_DIGITAL,
      clinic_id: DEMO_CLINIC,
      patient_id: ASHA_MENON,
      template_key: "root_canal",
      template_name: "Root Canal Treatment Consent",
      template_version: 1,
      source: "digital",
      status: "signed",
      content_snapshot: snapshot("Root Canal Treatment Consent"),
      patient_signed_name: "Asha Menon",
      patient_signature: "data:image/png;base64,iVBORw0KGgo=",
      signed_at: new Date().toISOString(),
    }),
  });
  await supaFetch("consents", {
    method: "POST",
    body: JSON.stringify({
      id: UPLOADED,
      clinic_id: DEMO_CLINIC,
      patient_id: ASHA_MENON,
      template_key: "extraction",
      template_name: "Tooth Extraction Consent",
      template_version: 1,
      source: "uploaded",
      status: "signed",
      content_snapshot: snapshot("Tooth Extraction Consent"),
      file_name: "signed-extraction.pdf",
      file_type: "application/pdf",
      file_path: `${DEMO_CLINIC}/${ASHA_MENON}/${UPLOADED}/signed.pdf`,
      signed_at: new Date().toISOString(),
    }),
  });
}

async function cleanup() {
  await supaFetch(`consents?id=in.(${SIGNED_DIGITAL},${UPLOADED})`, { method: "DELETE" });
}

test.beforeAll(async () => {
  const reachable = await localSupabaseReachable();
  test.skip(!reachable, `Local Supabase not reachable at ${SUPABASE_URL} — run npm run db:start && npm run db:reset`);
  if (reachable) {
    await cleanup();
    await seed();
  }
});

test.afterAll(async () => {
  if (await localSupabaseReachable()) await cleanup();
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

test.describe("Patient Consent Forms", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemoClinic(page);
  });

  test("1. Consent Forms tab lists the patient's consents with distinct source labels", async ({ page }) => {
    // First hit to this route compiles it and lazily provisions the clinic's
    // consent templates, so allow extra time on a cold dev server.
    test.slow();
    // First hit compiles the route and provisions the clinic's templates
    // (blocking the tab's Promise.all); a warm reload then renders the list
    // deterministically without racing the cold-compile stream.
    await page.goto(`/dentist/patients/${ASHA_MENON}?tab=consent-forms`);
    await page.getByRole("heading", { name: "Consent Forms" }).waitFor({ timeout: 60_000 });
    await page.reload();

    await expect(page.getByRole("heading", { name: "Consent Forms" })).toBeVisible({ timeout: 30_000 });
    // Digital vs uploaded are labelled distinctly (at least one of each).
    await expect(page.getByText("Digitally Signed").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Patient Signed — Uploaded").first()).toBeVisible({ timeout: 30_000 });
    // Upload entry point present.
    await expect(page.getByRole("button", { name: "Upload Signed Consent" })).toBeVisible();
  });

  test("2. Viewing a digital consent renders the A4 consent document", async ({ page }) => {
    await page.goto(`/dentist/patients/${ASHA_MENON}?tab=consent-forms`);

    const digitalRow = page.getByRole("listitem").filter({ hasText: "Digitally Signed" });
    await digitalRow.getByRole("button", { name: "View" }).click();

    const doc = page.locator("#consent-document");
    await expect(doc).toBeVisible({ timeout: 15_000 });
    await expect(doc).toContainText("CONSENT FORM");
    await expect(doc).toContainText("My Dental Clinic");
    await expect(doc).toContainText("Asha Menon");
    await expect(doc).toContainText("Voluntary Consent");
    // Download / Print / WhatsApp actions are available for staff.
    await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send via WhatsApp" })).toBeVisible();
  });

  test("3. Treatment form shows the inline Consent toggle and auto-selects a template", async ({ page }) => {
    await page.goto(`/dentist/patients/${ASHA_MENON}?tab=treatments`);
    await page.getByRole("button", { name: "Add Treatment" }).first().click();

    await expect(page.getByText("Consent Form Required?")).toBeVisible({ timeout: 15_000 });
    // Turning it on reveals the auto-selected template picker.
    await page.getByRole("button", { name: "Yes", exact: true }).click();
    await expect(page.getByText("Consent Template")).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();
  });

  test("4. Upload Signed Consent dialog opens with a template picker", async ({ page }) => {
    await page.goto(`/dentist/patients/${ASHA_MENON}?tab=consent-forms`);
    await page.getByRole("button", { name: "Upload Signed Consent" }).click();

    await expect(page.getByText("Consent Type / Template")).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload & Save" })).toBeVisible();
  });
});

/**
 * Patient Consent Forms is a per-clinic pilot rollout (migration
 * 20260816010000_consent_forms_clinic_flag.sql). It is enabled for the pilot
 * clinic ("My Dental Clinic" locally / Clinic B in production) but NOT for
 * Dr. Liying's Dental Care — this proves the feature is genuinely absent
 * there, not just unlinked.
 */
test.describe("Patient Consent Forms — disabled for a non-pilot clinic", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator("select").waitFor({ state: "visible", timeout: 15_000 });
    await page.locator("select").selectOption({ label: "Dr. Liying's Dental Care" });
    await page.getByPlaceholder("you@example.com").fill("dentist@dentgrow.test");
    await page.getByPlaceholder("••••••••").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dentist(\/|$)/, { timeout: 20_000 });
  });

  test("5. Settings has no Consent Templates entry point", async ({ page }) => {
    await page.goto("/dentist/settings");
    await expect(page.getByText("Consent Templates")).not.toBeVisible();
  });

  test("6. Direct navigation to the templates page shows it is not enabled", async ({ page }) => {
    await page.goto("/dentist/settings/consent-templates");
    await expect(page.getByText("not enabled for your clinic")).toBeVisible({ timeout: 15_000 });
  });
});
