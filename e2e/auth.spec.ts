import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, CLINICS, attemptSignIn, signInStaff } from "./helpers/auth";

/**
 * e2e/auth.spec.ts — the three sign-in doors.
 *
 * DentGrow separates authentication by audience:
 *
 *   /login          dentists + receptionists
 *   /patient/login  patients
 *   /admin/login    the platform admin only
 *
 * This suite is the regression net for that split. It covers two things that
 * are easy to get wrong and expensive to get wrong:
 *
 *   1. Every existing account still works, lands in the right portal, and is
 *      never asked which clinic it belongs to.
 *   2. No door lets the wrong audience through — most importantly, knowing the
 *      admin URL is worth nothing without the admin flag.
 *
 * These run only when local Supabase is up and seeded; without it the app
 * cannot authenticate anyone and the suite skips rather than reporting noise.
 * Seeded accounts and passwords live in supabase/seed.sql.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55321";
/**
 * The local mail catcher every Auth email lands in (supabase/config.toml
 * [local_smtp]). Production sends the identical message through Resend SMTP
 * instead; nothing in this suite ever touches that account.
 */
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:55324";
/**
 * Service-role key for the LOCAL stack only — the Supabase CLI's fixed demo
 * value, identical on every local project and not a secret (see
 * playwright.config.ts, which passes the same one to the dev server). Used by
 * the recovery specs to put a seeded password back after they change it.
 */
const SERVICE_ROLE_KEY =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const THEME_KEY = "dentgrow-theme";

async function localSupabaseReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function forceTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    [THEME_KEY, theme] as const
  );
}

/**
 * The banner a rejected sign-in renders.
 *
 * Scoped to the form because Next.js renders its own permanently-empty
 * `role="alert"` route announcer into every page — an unscoped getByRole
 * ("alert") matches both and trips strict mode.
 */
function errorBanner(page: Page) {
  return page.locator('form [role="alert"]');
}

test.describe("authentication", () => {
  test.beforeAll(async () => {
    test.skip(
      !(await localSupabaseReachable()),
      `local Supabase not reachable at ${SUPABASE_URL} — run: npm run db:start && npm run db:reset`
    );
  });

  // ══ Staff ═══════════════════════════════════════════════════════════════

  test.describe("staff — /login", () => {
    test("Dr. Liying's dentist account signs in and lands on the dentist portal", async ({
      page,
    }) => {
      await signInStaff(page, ACCOUNTS.dentist, "dentist");

      await expect(page).toHaveURL(/\/dentist(\/|$)/);

      // The right clinic was resolved server-side. Asserted on data rather than
      // on a label: the dentist sees their OWN clinic's patient (seeded into
      // Dr. Liying's Dental Care) and none of the demo clinic's.
      await page.goto("/dentist/patients", { waitUntil: "networkidle" });
      await expect(page.getByText("Meera Patel").first()).toBeVisible();
      await expect(page.getByText("Asha Menon")).toHaveCount(0);
    });

    test("Dr. Liying's receptionist account signs in and lands on the receptionist portal", async ({
      page,
    }) => {
      await signInStaff(page, ACCOUNTS.receptionist, "receptionist");

      await expect(page).toHaveURL(/\/receptionist(\/|$)/);

      // Role is unchanged: a receptionist still cannot enter the dentist app.
      await page.goto("/dentist");
      await expect(page).toHaveURL(/\/receptionist(\/|$)/);
    });

    test("the form asks for nothing but email and password", async ({ page }) => {
      await page.goto("/login");

      await expect(page.getByLabel("Email address")).toBeVisible();
      await expect(page.getByLabel("Password", { exact: true })).toBeVisible();

      // No clinic dropdown...
      await expect(page.getByRole("combobox")).toHaveCount(0);
      await expect(page.locator("select")).toHaveCount(0);
      // ...and no role picker.
      await expect(page.getByRole("radio", { name: /dentist|receptionist/i })).toHaveCount(0);
    });

    test("a wrong password is refused in plain language, not Supabase's", async ({
      page,
    }) => {
      await attemptSignIn(page, "/login", {
        email: ACCOUNTS.dentist.email,
        password: "definitely-wrong",
      });

      await expect(errorBanner(page)).toBeVisible();
      const text = (await errorBanner(page).textContent()) ?? "";
      expect(text).toContain("don't match");
      // No raw Supabase / Postgres wording leaks through.
      expect(text.toLowerCase()).not.toContain("invalid login credentials");
      expect(text.toLowerCase()).not.toContain("supabase");
      await expect(page).toHaveURL(/\/login/);
    });

    test("a patient cannot sign in through the staff door", async ({ page }) => {
      await attemptSignIn(page, "/login", ACCOUNTS.patient);

      await expect(errorBanner(page)).toContainText("patient portal");
      await expect(page).toHaveURL(/\/login/);

      // And the rejected session really was destroyed — no half-open state.
      await page.goto("/dentist");
      await expect(page).toHaveURL(/\/login/);
    });
  });

  // ══ Patient ═════════════════════════════════════════════════════════════

  test.describe("patient — /patient/login", () => {
    test("an existing patient signs in straight to the portal", async ({ page }) => {
      await page.goto("/patient/login");
      await page.getByLabel("Email address").fill(ACCOUNTS.patient.email);
      await page.getByLabel("Password", { exact: true }).fill(ACCOUNTS.patient.password);
      await page.getByRole("button", { name: "Sign in" }).click();

      await page.waitForURL("**/portal**", { timeout: 30_000 });

      // Straight to the portal — an already-linked patient is never sent back
      // through setup, and never asked to register again.
      await expect(page).toHaveURL(/\/portal(\/|$)/);
      await expect(page).not.toHaveURL(/\/portal\/setup/);
    });

    test("the form has no clinic dropdown and no role picker", async ({ page }) => {
      await page.goto("/patient/login");

      await expect(page.getByLabel("Email address")).toBeVisible();
      await expect(page.getByRole("combobox")).toHaveCount(0);
      await expect(page.locator("select")).toHaveCount(0);
    });

    test("staff cannot sign in through the patient door", async ({ page }) => {
      await attemptSignIn(page, "/patient/login", ACCOUNTS.dentist);

      await expect(errorBanner(page)).toContainText("staff");
      await expect(page).toHaveURL(/\/patient\/login/);

      await page.goto("/dentist");
      await expect(page).toHaveURL(/\/login/);
    });

    test("a patient cannot reach the staff portal", async ({ page }) => {
      await page.goto("/patient/login");
      await page.getByLabel("Email address").fill(ACCOUNTS.patient.email);
      await page.getByLabel("Password", { exact: true }).fill(ACCOUNTS.patient.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL("**/portal**", { timeout: 30_000 });

      for (const route of ["/dentist", "/receptionist"]) {
        await page.goto(route);
        await expect(page).toHaveURL(/\/portal(\/|$)/);
      }
    });
  });

  // ══ New patient signup ══════════════════════════════════════════════════

  test.describe("new patient — /patient/signup", () => {
    test("clinic selection is required, then the account is created in that clinic", async ({
      page,
    }) => {
      // Unique per run so re-running the suite doesn't collide with itself.
      const stamp = Date.now();
      const email = `e2e-signup-${stamp}@dentgrow.test`;
      const phone = `98${String(stamp).slice(-8)}`;

      await page.goto("/patient/signup");

      // The button is disabled until a clinic is chosen — the choice is the
      // point of this page, not an optional extra.
      const submit = page.getByRole("button", { name: "Create account" });
      await expect(submit).toBeDisabled();

      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: CLINICS.liying }).click();
      await expect(submit).toBeEnabled();

      await page.getByLabel("Full name").fill("E2E New Patient");
      await page.getByLabel("Phone number").fill(phone);
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password", { exact: true }).fill("password123");
      await page.getByLabel("Confirm password").fill("password123");
      await submit.click();

      // Email confirmation is ON, so signUp returns no session and the account
      // cannot be used yet. Signup therefore hands off to the "check your
      // email" screen, not to the linking step — /portal/setup at this moment
      // would be a page that cannot do anything and does not say why.
      await page.waitForURL("**/patient/verify-email**", { timeout: 30_000 });
      await expect(
        page.getByRole("heading", { name: "Check your email" })
      ).toBeVisible();

      // The address is echoed back masked: enough to catch a typo, not enough
      // to read off a shared screen. The full local part must never appear.
      const local = email.split("@")[0];
      await expect(page.getByText(`${local[0]}••••@dentgrow.test`)).toBeVisible();
      await expect(page.getByText(local, { exact: true })).toHaveCount(0);
    });

    test("signing up with an address that already exists is explained, not swallowed", async ({
      page,
    }) => {
      await page.goto("/patient/signup");

      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: CLINICS.liying }).click();

      await page.getByLabel("Full name").fill("Duplicate Account");
      await page.getByLabel("Phone number").fill("9812345670");
      await page.getByLabel("Email address").fill(ACCOUNTS.patient.email);
      await page.getByLabel("Password", { exact: true }).fill("password123");
      await page.getByLabel("Confirm password").fill("password123");
      await page.getByRole("button", { name: "Create account" }).click();

      // Supabase may either report the duplicate or — because "confirm email"
      // is on — accept it silently rather than confirm the address exists.
      // Either way the user must not be dropped into someone else's portal.
      await page.waitForURL(/\/(patient\/signup|patient\/verify-email|portal\/setup)/, {
        timeout: 30_000,
      });
      await expect(page).not.toHaveURL(/\/portal$/);
    });

    test("/signup still works for old bookmarks", async ({ page }) => {
      await page.goto("/signup");
      await expect(page).toHaveURL(/\/patient\/signup/);
    });
  });

  // ══ Email verification ══════════════════════════════════════════════════
  //
  // The screen between "account created" and "account usable". It sends no
  // email of its own: "Resend email" calls Supabase Auth's own resend, which
  // goes out over whatever SMTP the project has (Mailpit here, Resend in
  // production).

  test.describe("verification — /patient/verify-email", () => {
    /** Register a fresh patient and stop on the verification screen. */
    async function signUpAndWait(page: Page): Promise<string> {
      const email = `e2e-verify-${Date.now()}@dentgrow.test`;

      await page.goto("/patient/signup");
      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: CLINICS.liying }).click();
      await page.getByLabel("Full name").fill("E2E Verify");
      await page.getByLabel("Phone number").fill(`97${String(Date.now()).slice(-8)}`);
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password", { exact: true }).fill("password123");
      await page.getByLabel("Confirm password").fill("password123");
      await page.getByRole("button", { name: "Create account" }).click();
      await page.waitForURL("**/patient/verify-email**", { timeout: 30_000 });

      return email;
    }

    test("explains what happened and offers both ways out", async ({ page }) => {
      await signUpAndWait(page);

      await expect(page.getByText("Verification link sent to")).toBeVisible();
      await expect(page.getByRole("button", { name: "Change email" })).toBeVisible();
      // The resend control is present in one of its two states.
      await expect(
        page.getByRole("button", { name: /Resend email|Resend in \d+s/ })
      ).toBeVisible();
    });

    test("resend opens already counting down, because signup just sent one", async ({
      page,
    }) => {
      await signUpAndWait(page);

      // Supabase measures its throttle from the confirmation SIGNUP sent, so on
      // arrival a resend would be refused. An enabled button here would hand the
      // patient a guaranteed rejection and read as a broken system; the
      // countdown says the same thing truthfully and before the click.
      const cooling = page.getByRole("button", { name: /Resend in \d+s/ });
      await expect(cooling).toBeVisible();
      await expect(cooling).toBeDisabled();

      // And it really is counting, not just stuck.
      const first = Number(/(\d+)/.exec((await cooling.textContent()) ?? "")![1]);
      await expect
        .poll(
          async () => Number(/(\d+)/.exec((await cooling.textContent()) ?? "")?.[1] ?? first),
          { timeout: 15_000 }
        )
        .toBeLessThan(first);
    });

    test("'Change email' returns to signup with the address dropped", async ({ page }) => {
      await signUpAndWait(page);

      await page.getByRole("button", { name: "Change email" }).click();
      await page.waitForURL("**/patient/signup**", { timeout: 30_000 });

      // The pending address is gone, so the verification screen has nothing
      // left to wait for and sends visitors to sign-in instead.
      await page.goto("/patient/verify-email");
      await expect(page).toHaveURL(/\/patient\/login/);
    });

    test("a dead link is explained where it can be fixed, not on a blank form", async ({
      page,
    }) => {
      await signUpAndWait(page);

      // What /auth/callback redirects to when verifyOtp rejects a spent or
      // expired signup token.
      await page.goto("/patient/verify-email?error=link");

      const alert = page.locator('[role="alert"]').filter({ hasText: /expired/i });
      await expect(alert).toBeVisible();
      // …next to the control that fixes it, rather than on a page that offers
      // no way forward.
      await expect(
        page.getByRole("button", { name: /Resend email|Resend in \d+s/ })
      ).toBeVisible();
    });

    test("'Resend email' really delivers a second message", async ({ page }) => {
      // Deliberately longer than the default: this waits out Supabase's real
      // throttle window rather than mocking it, because the thing worth proving
      // is that a second message is actually accepted and delivered by the
      // configured SMTP server — Mailpit here, Resend in production.
      test.setTimeout(180_000);

      const email = await signUpAndWait(page);

      const delivered = async () => {
        const res = await fetch(
          `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`
        );
        if (!res.ok) return 0;
        const body = (await res.json()) as { messages?: unknown[] };
        return body.messages?.length ?? 0;
      };

      // Signup itself sent the first one.
      await expect.poll(delivered, { timeout: 30_000 }).toBe(1);

      // Wait for the throttle to lift, then send again for real.
      const resend = page.getByRole("button", { name: /Resend email|Resend in \d+s/ });
      await expect(resend).toBeEnabled({ timeout: 90_000 });
      await resend.click();

      await expect(
        page.getByRole("status").filter({ hasText: "Verification email sent" })
      ).toBeVisible({ timeout: 30_000 });

      await expect.poll(delivered, { timeout: 30_000 }).toBe(2);
    });

    test("is unreachable without a pending signup", async ({ page }) => {
      await page.goto("/patient/verify-email");
      await expect(page).toHaveURL(/\/patient\/login/);
    });

    for (const theme of ["light", "dark"] as const) {
      test(`${theme}: renders without horizontal overflow from 320px up`, async ({
        page,
      }) => {
        await forceTheme(page, theme);
        await signUpAndWait(page);

        for (const width of [320, 360, 390, 768, 1440]) {
          await page.setViewportSize({ width, height: 860 });
          await page.goto("/patient/verify-email", { waitUntil: "networkidle" });

          const scrolls = await page.evaluate(
            () =>
              document.documentElement.scrollWidth >
              document.documentElement.clientWidth + 1
          );
          expect(scrolls, `overflow at ${width}px (${theme})`).toBe(false);

          // Both recovery paths stay reachable and comfortably tappable.
          // The resend control is matched loosely because it may be showing its
          // cooldown label.
          for (const name of [/Resend email|Resend in \d+s/, /Change email/]) {
            const box = await page.getByRole("button", { name }).boundingBox();
            expect(box, `${name} missing at ${width}px`).not.toBeNull();
            expect(box!.height).toBeGreaterThanOrEqual(44);
          }

          if (width === 390 || width === 1440) {
            await page.screenshot({
              path: `test-results/auth/${theme}_verify-email_${width}.png`,
              fullPage: true,
            });
          }
        }
      });
    }
  });

  // ══ Admin ═══════════════════════════════════════════════════════════════

  test.describe("admin — /admin/login", () => {
    test("owner@dentgrow.local signs in and reaches the admin console", async ({
      page,
    }) => {
      await page.goto("/admin/login");
      await page.getByLabel("Email address").fill(ACCOUNTS.admin.email);
      await page.getByLabel("Password", { exact: true }).fill(ACCOUNTS.admin.password);
      await page.getByRole("button", { name: "Continue" }).click();

      await page.waitForURL("**/admin", { timeout: 30_000 });
      await expect(page.getByRole("heading", { name: "OraMedha Admin" })).toBeVisible();

      await page.screenshot({
        path: "test-results/auth/admin-console.png",
        fullPage: true,
      });

      // The admin keeps its existing clinic access — admin is an extra door,
      // not a replacement account.
      await expect(page.getByText(CLINICS.demo).first()).toBeVisible();
      await page.goto("/dentist");
      await expect(page).toHaveURL(/\/dentist(\/|$)/);
    });

    test("a dentist with valid credentials is refused at the admin door", async ({
      page,
    }) => {
      await page.goto("/admin/login");
      await page.getByLabel("Email address").fill(ACCOUNTS.dentist.email);
      await page.getByLabel("Password", { exact: true }).fill(ACCOUNTS.dentist.password);
      await page.getByRole("button", { name: "Continue" }).click();

      await expect(errorBanner(page)).toContainText("not authorized");
      await expect(page).toHaveURL(/\/admin\/login/);

      // The session was destroyed, so the URL is worth nothing afterwards.
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/admin\/login/);
    });

    test("a receptionist is refused at the admin door", async ({ page }) => {
      await page.goto("/admin/login");
      await page.getByLabel("Email address").fill(ACCOUNTS.receptionist.email);
      await page
        .getByLabel("Password", { exact: true })
        .fill(ACCOUNTS.receptionist.password);
      await page.getByRole("button", { name: "Continue" }).click();

      await expect(errorBanner(page)).toContainText("not authorized");
      await expect(page).toHaveURL(/\/admin\/login/);
    });

    test("visiting /admin as a signed-in dentist does not bypass authorization", async ({
      page,
    }) => {
      await signInStaff(page, ACCOUNTS.dentist, "dentist");

      await page.goto("/admin");
      await expect(page).toHaveURL(/\/dentist(\/|$)/);
      await expect(page.getByRole("heading", { name: "OraMedha Admin" })).toHaveCount(0);

      // And the admin sign-in page itself doesn't offer them a second chance.
      await page.goto("/admin/login");
      await expect(page).toHaveURL(/\/dentist(\/|$)/);
    });

    test("the admin account cannot sign in through the staff door", async ({ page }) => {
      await attemptSignIn(page, "/login", ACCOUNTS.admin);

      await expect(errorBanner(page)).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
      await page.goto("/dentist");
      await expect(page).toHaveURL(/\/login/);
    });

    test("admin is not advertised anywhere in the public UI", async ({ page }) => {
      for (const route of ["/login", "/patient/login", "/patient/signup"]) {
        await page.goto(route);

        const body = (await page.locator("body").innerText()).toLowerCase();
        expect(body, `${route} mentions admin`).not.toContain("admin");

        const adminLinks = await page.locator('a[href*="/admin"]').count();
        expect(adminLinks, `${route} links to /admin`).toBe(0);
      }
    });

    test("the admin pages are not indexable", async ({ page }) => {
      await page.goto("/admin/login");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/
      );
    });
  });

  // ══ Password recovery ═══════════════════════════════════════════════════

  /**
   * Self-service reset used to be patient-only. It now covers dentist and
   * receptionist, so what needs proving is not that the form submits — it
   * always did — but that a STAFF address actually receives a recovery email
   * and that the link lands somewhere that can change the password.
   *
   * The platform admin is deliberately still excluded, and that exclusion is
   * asserted below rather than assumed: it is enforced in the action, not by
   * omitting a link, so typing the admin address into the form by hand must
   * still send nothing.
   *
   * Delivery is asserted against Mailpit rather than mocked, for the reason the
   * resend spec above gives: the interesting failure is a transport that
   * accepts the request and silently refuses the recipient, which is exactly
   * what Supabase's built-in service does to a non-team address in production.
   * A mock cannot fail that way, so a mock would prove nothing.
   */
  test.describe("password recovery — staff and patient", () => {
    /**
     * Put a seeded account's password back.
     *
     * These tests genuinely change the password — that is the thing being
     * proven — and every other spec in this suite signs in with the seeded one.
     * Without this, the first recovery test would silently break every later
     * sign-in until the next `npm run db:reset`, which is the order-dependence
     * that makes a suite unreliable rather than useful.
     */
    async function restorePassword(email: string, password: string): Promise<void> {
      const headers = {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      };
      const list = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`,
        { headers }
      );
      if (!list.ok) return;
      const { users } = (await list.json()) as { users?: { id: string; email?: string }[] };
      const user = (users ?? []).find(
        (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
      );
      if (!user) return;

      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ password }),
      });
    }

    /** Message IDs currently sitting in Mailpit for an address. */
    async function messageIdsFor(email: string): Promise<string[]> {
      const search = await fetch(
        `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`
      );
      if (!search.ok) return [];
      const { messages } = (await search.json()) as { messages?: { ID: string }[] };
      return (messages ?? []).map((m) => m.ID);
    }

    /**
     * The recovery link from a message this test actually caused.
     *
     * `excluding` matters more than it looks. Mailpit persists across runs and
     * `npm run db:reset` does not empty it, so simply taking the newest message
     * for an address can pick up a token from an earlier run. Those tokens fail
     * verification — the PKCE verifier cookie belongs to a browser context that
     * no longer exists — and the resulting `?error=link` looks exactly like a
     * broken product rather than a dirty inbox. Ask only for an ID that was not
     * there before the request.
     */
    async function newRecoveryLink(
      email: string,
      excluding: string[]
    ): Promise<string | null> {
      const fresh = (await messageIdsFor(email)).filter((id) => !excluding.includes(id));
      if (fresh.length === 0) return null;

      const message = await fetch(`${MAILPIT_URL}/api/v1/message/${fresh[0]}`);
      if (!message.ok) return null;
      const { Text, HTML } = (await message.json()) as { Text?: string; HTML?: string };

      // The template links at /auth/callback?token_hash=…&type=recovery.
      const match = `${Text ?? ""}${HTML ?? ""}`.match(
        /https?:\/\/[^\s"'<>]*\/auth\/callback\?[^\s"'<>]*type=recovery[^\s"'<>]*/
      );
      return match ? match[0].replace(/&amp;/g, "&") : null;
    }

    for (const [who, account, expectedDoor] of [
      ["a dentist", ACCOUNTS.dentist, /\/login/],
      ["a receptionist", ACCOUNTS.receptionist, /\/login/],
    ] as const) {
      test(`${who} receives a reset email and can set a new password`, async ({ page }) => {
        test.setTimeout(120_000);

        // Snapshot the inbox first so only a message THIS request produced can
        // satisfy the poll below.
        const before = await messageIdsFor(account.email);

        await page.goto("/forgot-password");
        await page.getByLabel("Email address").fill(account.email);
        await page.getByRole("button", { name: /Send|Reset|Continue/ }).click();

        // The response is generic by design, so delivery is the real assertion:
        // a staff address that silently receives nothing is precisely the
        // production failure this test exists to catch.
        await expect
          .poll(() => newRecoveryLink(account.email, before), { timeout: 45_000 })
          .not.toBeNull();

        const link = await newRecoveryLink(account.email, before);
        expect(link).toBeTruthy();

        // Re-base onto the test server. The template builds links from
        // {{ .SiteURL }}, which supabase/config.toml pins to port 3000, while
        // this suite runs its own dev server on 3100 (playwright.config.ts) so
        // it never collides with a developer's. The token and the destination
        // path are what matter here; which port local Auth was told to
        // advertise is not part of what this test is proving.
        const emailed = new URL(link as string);
        const onTestServer = new URL(
          `${emailed.pathname}${emailed.search}`,
          page.url().startsWith("http") ? new URL(page.url()).origin : "http://localhost:3100"
        );

        await page.goto(onTestServer.toString());
        await expect(page).toHaveURL(/\/reset-password/);

        // The link established a recovery session, so the form is usable.
        const next = "newpassword456";
        await page.getByLabel("New password").fill(next);
        await page.getByLabel("Confirm password").fill(next);
        await page.getByRole("button", { name: /Reset password/ }).click();

        // Staff must land on the STAFF door, not the patient one — the doors
        // reject each other's accounts, so the wrong redirect strands them.
        await expect(page).toHaveURL(expectedDoor, { timeout: 30_000 });

        // And the new password genuinely works.
        await page.getByLabel("Email address").fill(account.email);
        await page.getByLabel("Password", { exact: true }).fill(next);
        await page.getByRole("button", { name: /Sign in/ }).click();
        await page.waitForURL(/\/(dentist|receptionist)/, { timeout: 30_000 });

        // Hand the account back exactly as it was found.
        await restorePassword(account.email, account.password);
      });
    }

    test("the platform admin is refused — no email, and no way to tell", async ({
      page,
    }) => {
      const before = await messageIdsFor(ACCOUNTS.admin.email);

      await page.goto("/forgot-password");
      await page.getByLabel("Email address").fill(ACCOUNTS.admin.email);
      await page.getByRole("button", { name: /Send|Reset|Continue/ }).click();
      await page.waitForLoadState("networkidle");

      // Nothing is sent. Given a generous window so this fails on a real send
      // rather than on being fast.
      await page.waitForTimeout(6000);
      expect(await messageIdsFor(ACCOUNTS.admin.email)).toEqual(before);

      // And the admin door still offers no route into this flow.
      await page.goto("/admin/login");
      await expect(page.getByRole("link", { name: /Forgot password/i })).toHaveCount(0);
    });

    test("the response is identical for a real address and an unknown one", async ({
      page,
    }) => {
      const confirmationFor = async (email: string) => {
        await page.goto("/forgot-password");
        await page.getByLabel("Email address").fill(email);
        await page.getByRole("button", { name: /Send|Reset|Continue/ }).click();
        // Whatever the page settles on, both addresses must reach the same one.
        await page.waitForLoadState("networkidle");
        return (await page.locator("main").innerText()).replace(/\s+/g, " ").trim();
      };

      const real = await confirmationFor(ACCOUNTS.dentist.email);
      const unknown = await confirmationFor("no-such-account-9f2a@dentgrow.test");

      expect(unknown).toBe(real);
    });
  });

  // ══ Routing ═════════════════════════════════════════════════════════════

  test.describe("routing", () => {
    test("a logged-out visitor is sent to the door that matches where they were going", async ({
      page,
    }) => {
      const cases: [string, RegExp][] = [
        ["/dentist", /\/login/],
        ["/receptionist", /\/login/],
        ["/portal", /\/patient\/login/],
        ["/portal/treatments", /\/patient\/login/],
        ["/admin", /\/admin\/login/],
      ];

      for (const [route, expected] of cases) {
        await page.context().clearCookies();
        await page.goto(route);
        await expect(page, `${route} should land on ${expected}`).toHaveURL(expected);
      }
    });

    test("an authenticated user is bounced off the sign-in pages", async ({ page }) => {
      await signInStaff(page, ACCOUNTS.dentist, "dentist");

      for (const route of ["/login", "/patient/login", "/patient/signup"]) {
        await page.goto(route);
        await expect(page).toHaveURL(/\/dentist(\/|$)/);
      }
    });
  });

  // ══ Presentation ════════════════════════════════════════════════════════

  test.describe("presentation", () => {
    const PAGES = [
      ["/login", "staff sign-in"],
      ["/patient/login", "patient sign-in"],
      ["/patient/signup", "patient signup"],
      ["/admin/login", "admin sign-in"],
    ] as const;

    // The widths named in the visual QA brief.
    const WIDTHS = [320, 360, 390, 430, 768, 1440];

    for (const theme of ["light", "dark"] as const) {
      test(`${theme}: every door renders without horizontal overflow at every width`, async ({
        page,
      }) => {
        // 4 doors × 6 widths = 24 full page loads at networkidle, plus two
        // full-page screenshots each. This measured 56.2s against the 60s
        // default before "Forgot password?" was added to the staff and admin
        // forms — close enough that one more element in the layout tipped it
        // over. The work is genuinely slow, not stuck, so it gets more room
        // rather than fewer assertions.
        test.slow();

        await forceTheme(page, theme);

        const overflow: string[] = [];

        for (const [route, name] of PAGES) {
          for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: 860 });
            await page.goto(route, { waitUntil: "networkidle" });

            const scrolls = await page.evaluate(
              () =>
                document.documentElement.scrollWidth >
                document.documentElement.clientWidth + 1
            );
            if (scrolls) overflow.push(`${name} @ ${width}px (${theme})`);

            // The form must be usable, not merely present.
            await expect(page.getByLabel("Email address")).toBeVisible();
            await expect(
              page.getByRole("button", { name: /Sign in|Continue|Create account/ })
            ).toBeVisible();

            if (width === 390 || width === 1440) {
              await page.screenshot({
                path: `test-results/auth/${theme}_${name.replace(/\s+/g, "-")}_${width}.png`,
                fullPage: true,
              });
            }
          }
        }

        expect(overflow, `horizontal overflow: ${overflow.join(", ")}`).toEqual([]);
      });
    }

    /**
     * Text contrast, measured rather than eyeballed.
     *
     * Runs inside the page: for every text node in the form column, resolve the
     * colour it actually rendered with and the background it actually sits on,
     * and compute the WCAG 2.1 ratio. Anything below AA body text (4.5:1) is a
     * defect, in either theme.
     *
     * The appearance control is excluded by name, not by lowering the bar: it
     * is the shared ThemeToggle, and its inactive segments sit at the app-wide
     * `text-text-secondary` value (4.40:1 on white) that every other page in
     * DentGrow also uses. Fixing that is a token change across the whole
     * product, not something to smuggle in through the sign-in pages.
     */
    const CONTRAST_AUDIT = `(() => {
      const parse = (c) => {
        const m = /rgba?\(([^)]+)\)/.exec(c);
        if (!m) return null;
        const p = m[1].split(',').map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      };
      const lum = ({ r, g, b }) => {
        const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (x, y) => {
        const a = lum(x), b = lum(y), hi = Math.max(a, b), lo = Math.min(a, b);
        return (hi + 0.05) / (lo + 0.05);
      };
      /** Walk up until something actually paints a background. */
      const backdrop = (el) => {
        let n = el;
        while (n) {
          const bg = parse(getComputedStyle(n).backgroundColor);
          if (bg && bg.a > 0.9) return bg;
          n = n.parentElement;
        }
        return { r: 255, g: 255, b: 255 };
      };

      const bad = [];
      const root = document.querySelector('main');
      if (!root) return [{ el: 'main', detail: 'form column not found' }];

      for (const el of root.querySelectorAll('*')) {
        if (el.closest('[role="radiogroup"]')) continue;   // shared ThemeToggle
        const text = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join(' ')
          .trim();
        if (!text) continue;

        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;

        const fg = parse(cs.color);
        if (!fg) continue;
        const r = ratio(fg, backdrop(el));
        if (r < 4.5) {
          bad.push({
            el: el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ').slice(0, 2).join('.'),
            text: text.slice(0, 40),
            ratio: +r.toFixed(2),
          });
        }
      }
      return bad;
    })()`;

    for (const theme of ["light", "dark"] as const) {
      test(`${theme}: all text on every door clears WCAG AA`, async ({ page }) => {
        await forceTheme(page, theme);

        const failures: string[] = [];
        for (const [route, name] of PAGES) {
          await page.goto(route, { waitUntil: "networkidle" });
          const bad = (await page.evaluate(CONTRAST_AUDIT)) as {
            el: string;
            text: string;
            ratio: number;
          }[];
          for (const b of bad) {
            failures.push(`${name}: "${b.text}" = ${b.ratio}:1 (${b.el})`);
          }
        }

        expect(failures, failures.join("; ")).toEqual([]);
      });
    }

    test("dark mode is applied before first paint on every door", async ({ page }) => {
      await forceTheme(page, "dark");

      for (const [route] of PAGES) {
        await page.goto(route);
        const state = await page.evaluate(() => ({
          hasDark: document.documentElement.classList.contains("dark"),
          colorScheme: document.documentElement.style.colorScheme,
        }));
        expect(state.hasDark, `${route} did not paint dark`).toBe(true);
        expect(state.colorScheme).toBe("dark");
      }
    });

    test("the password visibility toggle reveals and re-hides the value", async ({
      page,
    }) => {
      await page.goto("/login");

      const password = page.getByLabel("Password", { exact: true });
      await password.fill("hunter2");
      await expect(password).toHaveAttribute("type", "password");

      await page.getByRole("button", { name: "Show password" }).click();
      await expect(password).toHaveAttribute("type", "text");
      await expect(password).toHaveValue("hunter2");

      await page.getByRole("button", { name: "Hide password" }).click();
      await expect(password).toHaveAttribute("type", "password");
    });

    test("the submit button reports progress and blocks a second submission", async ({
      page,
    }) => {
      await page.goto("/login");
      await page.getByLabel("Email address").fill(ACCOUNTS.dentist.email);
      await page.getByLabel("Password", { exact: true }).fill(ACCOUNTS.dentist.password);

      const submit = page.getByRole("button", { name: "Sign in" });
      await submit.click();

      // The label flips and the control locks in the same tick as the submit,
      // so there is never a window where a second click could get through.
      await expect(page.getByRole("button", { name: "Signing in…" })).toBeDisabled();
      await page.waitForURL("**/dentist**", { timeout: 30_000 });
    });

    test("the form is fully operable from the keyboard", async ({ page }) => {
      await page.goto("/login");

      // Email is focused on load; tabbing walks
      //   forgot-password → password → toggle → submit.
      //
      // "Forgot password?" sits in the password field's label row, so it comes
      // BEFORE the input in DOM order — the same shape the patient form has
      // always had. It is asserted rather than skipped over: a recovery link a
      // keyboard user cannot reach is a recovery link that does not exist for
      // them, and this test is the only thing that would notice.
      await expect(page.getByLabel("Email address")).toBeFocused();
      await page.keyboard.type(ACCOUNTS.dentist.email);

      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Forgot password?" })).toBeFocused();

      await page.keyboard.press("Tab");
      await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
      await page.keyboard.type(ACCOUNTS.dentist.password);

      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Show password" })).toBeFocused();

      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
      await page.keyboard.press("Enter");

      await page.waitForURL("**/dentist**", { timeout: 30_000 });
    });

    test("mobile: the staff door works end to end at 390px", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await signInStaff(page, ACCOUNTS.dentist, "dentist");
      await expect(page).toHaveURL(/\/dentist(\/|$)/);
    });

    test("mobile: the patient door works end to end at 360px", async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto("/patient/login");
      await page.getByLabel("Email address").fill(ACCOUNTS.patient.email);
      await page.getByLabel("Password", { exact: true }).fill(ACCOUNTS.patient.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL("**/portal**", { timeout: 30_000 });
    });

    test("each door has its own distinct panel", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });

      const panels: Record<string, string> = {};
      for (const [route] of PAGES) {
        await page.goto(route);
        panels[route] = await page.evaluate(
          () => getComputedStyle(document.querySelector("aside")!).backgroundColor
        );
      }

      // Staff, patient and admin must not look like the same page with
      // different words on it.
      expect(panels["/login"]).not.toBe(panels["/patient/login"]);
      expect(panels["/login"]).not.toBe(panels["/admin/login"]);
      expect(panels["/patient/login"]).not.toBe(panels["/admin/login"]);
      // Login and signup are siblings and deliberately share a tone.
      expect(panels["/patient/login"]).toBe(panels["/patient/signup"]);
    });
  });
});
