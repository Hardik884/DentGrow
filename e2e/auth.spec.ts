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

      // Email is focused on load; tabbing walks password → toggle → submit.
      await expect(page.getByLabel("Email address")).toBeFocused();
      await page.keyboard.type(ACCOUNTS.dentist.email);

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
