import { test, expect, type Page } from "@playwright/test";

/**
 * e2e/business-brain.spec.ts
 *
 * Playwright coverage for the Actions / Business Brain UI overhaul:
 *   - Needs Attention headings differ from What To Do headings
 *   - Steps are collapsed by default and expand correctly
 *   - Needs Attention / What To Do rows have balanced (equal) height
 *   - Primary buttons are prominent and only shown where appropriate
 *   - "Book Appointment" opens INLINE (no navigation away from the page)
 *   - There is no separate standalone "Patients to contact" section
 *
 * Runs against a LOCAL Supabase instance (never the linked remote project),
 * using the "My Dental Clinic" demo account — the only clinic allow-listed
 * for the Business Brain page (see lib/feature-flags.ts).
 *
 * Deliberately structural rather than pinned to specific diagnosis text:
 * which problems the Business Brain surfaces depends on live clinic data and
 * the actual calendar date, which this suite must not fake or manipulate
 * (the diagnosis/threshold logic itself is explicitly out of scope for this
 * change). So assertions check the SHAPE of whatever is currently showing —
 * headings differ, Steps toggle correctly, rows are balanced, buttons behave
 * — rather than which specific categories are active today.
 */

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:55321";

async function localSupabaseReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { signal: AbortSignal.timeout(3000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

test.beforeAll(async () => {
  const reachable = await localSupabaseReachable();
  test.skip(
    !reachable,
    `Local Supabase not reachable at ${SUPABASE_URL} — start it with: npm run db:start && npm run db:reset`,
  );
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

test.describe("Actions page — Needs Attention / What To Do", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemoClinic(page);
    await page.goto("/dentist/business-brain");
    await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible();
  });

  test("1. shows the two-column headers", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What to do" })).toBeVisible();
  });

  test("2. each row's problem heading differs from its action heading", async ({ page }) => {
    // Each paired row is a `.grid.grid-cols-1.lg:grid-cols-2` with a ProblemCard
    // (first h3) and, when present, an ActionCard (second h3).
    const rows = page.locator("main .grid.grid-cols-1");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    for (let i = 0; i < rowCount; i++) {
      const headings = rows.nth(i).locator("h3");
      const count = await headings.count();
      if (count < 2) continue; // no matching action card for this problem
      const problemTitle = (await headings.nth(0).textContent())?.trim();
      const actionTitle = (await headings.nth(1).textContent())?.trim();
      expect(problemTitle).toBeTruthy();
      expect(actionTitle).toBeTruthy();
      expect(actionTitle).not.toBe(problemTitle);
    }
  });

  test("3. Steps are collapsed by default and expand on click", async ({ page }) => {
    const stepsToggle = page.getByRole("button", { name: "Steps" }).first();
    const count = await page.getByRole("button", { name: "Steps" }).count();
    test.skip(count === 0, "No action card has Steps content to expand today.");

    await expect(stepsToggle).toHaveAttribute("aria-expanded", "false");
    await stepsToggle.click();
    await expect(stepsToggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: "Hide steps" }).first()).toBeVisible();
  });

  test("4. Needs Attention and What To Do rows are balanced (equal height per pair)", async ({
    page,
  }) => {
    const heights = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("main .grid.grid-cols-1"));
      return rows.map((row) => {
        const cells = Array.from(row.children) as HTMLElement[];
        return cells.map((c) => Math.round(c.getBoundingClientRect().height));
      });
    });
    expect(heights.length).toBeGreaterThan(0);
    for (const [a, b] of heights) {
      if (b === undefined) continue; // row with no matching action card
      expect(Math.abs(a - b)).toBeLessThanOrEqual(1); // equal, allowing for sub-pixel rounding
    }
  });

  test("5. no separate standalone 'Patients to contact' section exists", async ({ page }) => {
    await expect(page.getByText("Patients to contact")).toHaveCount(0);
  });

  test("6. a card can offer more than one action, but never the same action twice, and the first is visually primary", async ({
    page,
  }) => {
    // A card is allowed multiple buttons when more than one genuinely
    // applies (e.g. retention offers both Contact Patients and Create
    // Follow-up) — this only checks there's no accidental duplicate button
    // and that whichever buttons exist have a clear primary-vs-secondary
    // visual hierarchy (first solid, any further ones outlined).
    const rows = page.locator("main .grid.grid-cols-1");
    const rowCount = await rows.count();
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      for (const label of ["Contact Patients", "Book Appointment", "Create Follow-up"]) {
        expect(await row.getByRole("button", { name: label }).count()).toBeLessThanOrEqual(1);
      }

      const actionButtons = row.locator(
        'button:has-text("Contact Patients"), button:has-text("Book Appointment"), button:has-text("Create Follow-up")',
      );
      const count = await actionButtons.count();
      if (count < 2) continue;

      const firstBg = await actionButtons.first().evaluate((el) => getComputedStyle(el).backgroundColor);
      const secondBg = await actionButtons.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor);
      // Primary is solid dark (#09090B); secondary is white/outline — they
      // must not look identical, or there's no visual hierarchy at all.
      expect(firstBg).not.toBe(secondBg);
      expect(firstBg).toBe("rgb(9, 9, 11)");
    }
  });

  test("7. Book Appointment opens INLINE — no navigation away from the Actions page", async ({
    page,
  }) => {
    const bookButton = page.getByRole("button", { name: "Book Appointment" }).first();
    const count = await page.getByRole("button", { name: "Book Appointment" }).count();
    test.skip(count === 0, "No action card offers Book Appointment today.");

    await bookButton.click();

    // The dialog is open, and we never left /dentist/business-brain.
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page).toHaveURL(/\/dentist\/business-brain$/);
    await expect(page.getByPlaceholder(/Patient name/i)).toBeVisible();

    // Close it — still on the Actions page afterwards.
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/dentist\/business-brain$/);
    await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible();
  });

  test("8. Contact Patients (when offered) opens INLINE — no navigation away", async ({ page }) => {
    const contactButton = page.getByRole("button", { name: "Contact Patients" }).first();
    const count = await page.getByRole("button", { name: "Contact Patients" }).count();
    test.skip(count === 0, "No action card offers Contact Patients today (no reachable patients for any messageable diagnosis).");

    await contactButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page).toHaveURL(/\/dentist\/business-brain$/);

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/dentist\/business-brain$/);
  });

  test("9. Create Follow-up (when offered) opens INLINE — no navigation away", async ({ page }) => {
    const followUpButton = page.getByRole("button", { name: "Create Follow-up" }).first();
    const count = await page.getByRole("button", { name: "Create Follow-up" }).count();
    test.skip(count === 0, "No action card offers Create Follow-up today.");

    await followUpButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page).toHaveURL(/\/dentist\/business-brain$/);
    await expect(page.getByText("Follow-Up Type", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/dentist\/business-brain$/);
  });

  test("10. when retention is active, both Contact Patients AND Create Follow-up appear on the same card", async ({
    page,
  }) => {
    const contactCount = await page.getByRole("button", { name: "Contact Patients" }).count();
    const followUpCount = await page.getByRole("button", { name: "Create Follow-up" }).count();
    test.skip(
      contactCount === 0 || followUpCount === 0,
      "Retention isn't active today, so this multi-button pairing can't be observed.",
    );

    const row = page.locator("main .grid.grid-cols-1").filter({ hasText: "Contact Patients" }).filter({
      hasText: "Create Follow-up",
    });
    await expect(row).toHaveCount(1);
  });
});
