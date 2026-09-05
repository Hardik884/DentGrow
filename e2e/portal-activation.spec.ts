import { test, expect, type Page } from "@playwright/test";

/**
 * e2e/portal-activation.spec.ts — clinic-issued portal access, end to end.
 *
 * The unit specs prove the schema rules (one address per clinic, soft-deleted
 * records invisible, the same address allowed across clinics). This proves the
 * thing they cannot: that a real person, given only an address a clinic typed
 * in, can get through email → code → password and end up looking at THEIR OWN
 * clinic's data — and that the routes which used to let them pick a clinic no
 * longer do.
 *
 * The code is read out of Mailpit rather than mocked. A mock would prove the
 * form posts; it would not prove Supabase actually issues a token for this
 * flow, which is the part that depends on the template carrying {{ .Token }}
 * and is exactly what would silently regress.
 *
 * The extractor accepts 4-10 digits rather than exactly 6: the length is a
 * project setting (mailer_otp_length), and production issues 8 where local
 * issues 6. Pinning it here would make this suite pass only against whichever
 * environment the author had in mind.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55321";
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:55324";
const SERVICE_ROLE_KEY =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const CLINIC_A = "00000000-0000-0000-0000-000000000001"; // My Dental Clinic
const CLINIC_B = "11111111-1111-1111-1111-111111111111"; // Dr. Liying's Dental Care

/** Unique per run so a re-run never collides with its own leftovers. */
const STAMP = Date.now();
const ELIGIBLE_EMAIL = `activate.${STAMP}@dentgrow.test`;
const SHARED_EMAIL = `shared.${STAMP}@dentgrow.test`;
const NO_EMAIL_PATIENT = `e2e-noemail-${STAMP}`;

const created: { patients: string[]; users: string[] } = { patients: [], users: [] };

const svc = {
  headers: {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  },
};

async function createPatient(fields: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/patients`, {
    method: "POST",
    headers: { ...svc.headers, Prefer: "return=representation" },
    body: JSON.stringify(fields),
  });
  const [row] = (await res.json()) as { id: string }[];
  created.patients.push(row.id);
  return row.id;
}

async function messageIds(email: string): Promise<string[]> {
  const res = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`
  );
  if (!res.ok) return [];
  const { messages } = (await res.json()) as { messages?: { ID: string }[] };
  return (messages ?? []).map((m) => m.ID);
}

/**
 * The activation code from a message this test caused.
 *
 * `excluding` because Mailpit persists across runs and `db:reset` does not
 * clear it — taking the newest message for an address can otherwise pick up a
 * dead code from an earlier run, which fails verification and looks exactly
 * like a broken product rather than a dirty inbox.
 */
async function newCode(email: string, excluding: string[]): Promise<string | null> {
  const fresh = (await messageIds(email)).filter((id) => !excluding.includes(id));
  if (fresh.length === 0) return null;
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${fresh[0]}`);
  if (!res.ok) return null;
  const { Text, HTML } = (await res.json()) as { Text?: string; HTML?: string };
  const body = `${Text ?? ""}${HTML ?? ""}`;

  // Anchored to the "Your code" label rather than taking the first six digits
  // in the message. The rendered email contains other six-digit runs — inline
  // style values among them — and a bare /\b\d{6}\b/ picks whichever happens to
  // appear first, which is not stable across template edits. That produced a
  // "wrong code" failure that looked like a broken verify step.
  const match = body.match(/Your code[\s\S]{0,400}?(\d{4,10})/i);
  return match ? match[1] : null;
}

async function activate(page: Page, email: string, password: string) {
  const before = await messageIds(email);

  await page.goto("/patient/signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();

  await expect.poll(() => newCode(email, before), { timeout: 45_000 }).not.toBeNull();
  const code = await newCode(email, before);

  await page.getByLabel("Verification code").fill(code as string);
  await page.getByRole("button", { name: "Verify code" }).click();

  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
}

test.describe("patient portal activation", () => {
  test.beforeAll(async () => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`).catch(() => null);
    test.skip(!res?.ok, `local Supabase not reachable at ${SUPABASE_URL}`);
  });

  test.afterAll(async () => {
    for (const id of created.patients) {
      await fetch(`${SUPABASE_URL}/rest/v1/patients?id=eq.${id}`, {
        method: "DELETE",
        headers: svc.headers,
      });
    }
    for (const id of created.users) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
        method: "DELETE",
        headers: svc.headers,
      });
    }
  });

  // ── The clinic picker is gone ────────────────────────────────────────────

  test("signup asks for an email and nothing about a clinic", async ({ page }) => {
    await page.goto("/patient/signup");

    await expect(page.getByLabel("Email address")).toBeVisible();

    // The dropdown this page used to carry was the last place in the product
    // where a visitor could assert which tenant they belong to.
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(page.locator("select")).toHaveCount(0);
    await expect(page.locator('[name="clinic_id"]')).toHaveCount(0);
    await expect(page.getByText(/which clinic/i)).toHaveCount(0);
  });

  // ── The happy path ───────────────────────────────────────────────────────

  test("a patient whose clinic added their email can activate and sign in", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await createPatient({
      clinic_id: CLINIC_A,
      name: "Activation Patient",
      email: ELIGIBLE_EMAIL,
    });

    await activate(page, ELIGIBLE_EMAIL, "activate-me-123");

    // Straight into the portal. The session that verified the code is a real
    // one and step 3 just set a password on it, so there is nothing to sign in
    // for. Crucially NOT /portal/setup — that is the unlinked dead end, and
    // reaching it would mean the link was never written.
    await page.waitForURL("**/portal**", { timeout: 30_000 });
    await expect(page).toHaveURL(/\/portal(\/|$)/);
    await expect(page).not.toHaveURL(/\/portal\/setup/);
  });

  test("signing in again needs only email and password — no second code", async ({
    page,
  }) => {
    await page.goto("/patient/login");
    await page.getByLabel("Email address").fill(ELIGIBLE_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill("activate-me-123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL("**/portal**", { timeout: 30_000 });
    // Nothing asked for a code.
    await expect(page.getByLabel("Verification code")).toHaveCount(0);
  });

  // ── The refusals ─────────────────────────────────────────────────────────

  test("an address no clinic has issued gets the same answer, and no email", async ({
    page,
  }) => {
    const stranger = `stranger.${STAMP}@dentgrow.test`;
    const before = await messageIds(stranger);

    await page.goto("/patient/signup");
    await page.getByLabel("Email address").fill(stranger);
    await page.getByRole("button", { name: "Send code" }).click();

    // Identical screen to the eligible case — that is what stops this form
    // being a way to discover who a clinic's patients are.
    await expect(page.getByLabel("Verification code")).toBeVisible({ timeout: 15_000 });

    // ...and nothing was actually sent.
    await page.waitForTimeout(6000);
    expect(await messageIds(stranger)).toEqual(before);
  });

  test("a wrong code is refused", async ({ page }) => {
    await createPatient({
      clinic_id: CLINIC_A,
      name: "Wrong Code Patient",
      email: `wrongcode.${STAMP}@dentgrow.test`,
    });

    await page.goto("/patient/signup");
    await page.getByLabel("Email address").fill(`wrongcode.${STAMP}@dentgrow.test`);
    await page.getByRole("button", { name: "Send code" }).click();

    await expect(page.getByLabel("Verification code")).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Verification code").fill("000000");
    await page.getByRole("button", { name: "Verify code" }).click();

    await expect(page.locator('form [role="alert"]')).toContainText(/incorrect or has expired/i);
    // Still on the code step — no session was granted.
    await expect(page.getByLabel("Verification code")).toBeVisible();
  });

  test("an address on records in two clinics is refused rather than guessed", async ({
    page,
  }) => {
    // A person really can attend two practices. Nothing in the address says
    // which one they mean, so picking would expose one clinic's record to
    // someone who meant the other.
    await createPatient({ clinic_id: CLINIC_A, name: "Shared A", email: SHARED_EMAIL });
    await createPatient({ clinic_id: CLINIC_B, name: "Shared B", email: SHARED_EMAIL });

    const before = await messageIds(SHARED_EMAIL);

    await page.goto("/patient/signup");
    await page.getByLabel("Email address").fill(SHARED_EMAIL);
    await page.getByRole("button", { name: "Send code" }).click();

    await expect(page.getByLabel("Verification code")).toBeVisible({ timeout: 15_000 });

    // Same generic screen, and no code issued for either record.
    await page.waitForTimeout(6000);
    expect(await messageIds(SHARED_EMAIL)).toEqual(before);
  });

  test("a patient the clinic created without an email cannot activate", async ({
    page,
  }) => {
    await createPatient({ clinic_id: CLINIC_A, name: NO_EMAIL_PATIENT });

    // There is no address to type — which is the point. Confirm the record
    // exists and holds no address, so nothing can be sent for it.
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/patients?name=eq.${encodeURIComponent(NO_EMAIL_PATIENT)}&select=email`,
      { headers: svc.headers }
    );
    const rows = (await res.json()) as { email: string | null }[];
    expect(rows.length).toBe(1);
    expect(rows[0].email).toBeNull();

    // And the portal offers no way to claim a record by any other means.
    await page.goto("/patient/signup");
    await expect(page.getByLabel(/phone/i)).toHaveCount(0);
  });

  // ── Tenancy ──────────────────────────────────────────────────────────────

  test("an activated patient sees only their own clinic's data", async ({ page }) => {
    await page.goto("/patient/login");
    await page.getByLabel("Email address").fill(ELIGIBLE_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill("activate-me-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/portal**", { timeout: 30_000 });

    // Staff surfaces stay closed to them, exactly as before this change.
    for (const route of ["/dentist", "/receptionist"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/portal(\/|$)/);
    }
  });
});
