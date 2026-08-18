import { test, expect, type Page } from "@playwright/test";

/**
 * The designed dropdown, in both themes.
 *
 * The native <select> popup was rendered by the OS, so CSS never reached it and
 * its option list was unreadable in dark mode. It is now real DOM. These tests
 * check the two things that actually matter: the list is legible against the
 * dark surface, and replacing the control did not break the form contract that
 * two dozen call sites depend on.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55321";
const THEME_KEY = "dentgrow-theme";

async function localSupabaseReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function forceTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [THEME_KEY, theme] as const);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "My Dental Clinic" }).click();
  await page.getByPlaceholder("you@example.com").fill("brain@dentgrow.test");
  await page.getByPlaceholder("••••••••").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dentist**", { timeout: 30_000 });
}

/** Contrast of the option list's text against the surface it is painted on. */
const OPTION_CONTRAST = `(() => {
  const parse = (c) => { const m=/rgba?\\(([^)]+)\\)/.exec(c); if(!m) return null;
    const p=m[1].split(',').map(Number); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; };
  const lum = ({r,g,b}) => { const f=(c)=>{const s=c/255; return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4);};
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
  const ratio = (x,y) => { const a=lum(x),b=lum(y),hi=Math.max(a,b),lo=Math.min(a,b); return (hi+0.05)/(lo+0.05); };

  const list = document.querySelector('[role="listbox"]');
  if (!list) return { error: 'no listbox open' };

  const listBg = parse(getComputedStyle(list).backgroundColor);
  const enabled = [], disabled = [];
  for (const opt of list.querySelectorAll('[role="option"]')) {
    const cs = getComputedStyle(opt);
    const own = parse(cs.backgroundColor);
    const bg = own && own.a > 0.9 ? own : listBg;
    const row = { text: opt.textContent.trim().slice(0,30), ratio: +ratio(parse(cs.color), bg).toFixed(2) };
    (opt.getAttribute('aria-disabled') === 'true' ? disabled : enabled).push(row);
  }
  const worstOf = (rows) => rows.length ? rows.reduce((a,b) => a.ratio < b.ratio ? a : b) : null;
  return { listBg: getComputedStyle(list).backgroundColor, count: enabled.length + disabled.length,
           worst: worstOf(enabled), worstDisabled: worstOf(disabled) };
})()`;

test.describe("designed dropdown", () => {
  test.beforeAll(async () => {
    test.skip(!(await localSupabaseReachable()), `local Supabase not reachable at ${SUPABASE_URL}`);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: the option list is legible`, async ({ page }) => {
      await forceTheme(page, theme);
      await page.goto("/login");

      // The clinic picker on the login page is the same component as every
      // other dropdown in the app.
      await page.getByRole("combobox").first().click();
      await expect(page.getByRole("listbox")).toBeVisible();

      const result = (await page.evaluate(OPTION_CONTRAST)) as {
        error?: string; listBg: string; count: number;
        worst: { text: string; ratio: number } | null;
        worstDisabled: { text: string; ratio: number } | null;
      };

      expect(result.error).toBeUndefined();
      expect(result.count).toBeGreaterThan(0);

      await page.screenshot({ path: `test-results/theme/${theme}_dropdown_open.png` });

      // Selectable rows, including the highlighted one, must clear AA body text.
      expect(
        result.worst!.ratio,
        `worst option "${result.worst!.text}" = ${result.worst!.ratio}:1 on ${result.listBg}`,
      ).toBeGreaterThanOrEqual(4.5);

      // Disabled rows are usually the placeholder. WCAG 1.4.3 exempts inactive
      // controls, but the user still has to read this one, so hold it to the
      // large-text floor rather than letting it disappear.
      if (result.worstDisabled) {
        expect(
          result.worstDisabled.ratio,
          `disabled option "${result.worstDisabled.text}" = ${result.worstDisabled.ratio}:1`,
        ).toBeGreaterThanOrEqual(3.0);
      }
    });
  }

  test("dark: the list is a themed surface, not a white box", async ({ page }) => {
    await forceTheme(page, "dark");
    await page.goto("/login");
    await page.getByRole("combobox").first().click();

    const bg = await page.evaluate(() => {
      const el = document.querySelector('[role="listbox"]')!;
      return getComputedStyle(el).backgroundColor;
    });
    const [r, g, b] = /rgba?\(([^)]+)\)/.exec(bg)![1].split(",").map(Number);
    const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    expect(0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)).toBeLessThan(0.1);
  });

  test("keyboard: arrow keys and Enter select an option", async ({ page }) => {
    await forceTheme(page, "dark");
    await page.goto("/login");

    const trigger = page.getByRole("combobox").first();
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("listbox")).toBeVisible();

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("listbox")).toBeHidden();
    // Something real got chosen, and it landed on the underlying form control.
    const nativeValue = await page.evaluate(
      () => (document.querySelector("select") as HTMLSelectElement)?.value,
    );
    expect(nativeValue).toBeTruthy();
  });

  test("the hidden native select still drives form state", async ({ page }) => {
    // The whole point of keeping a real <select>: react-hook-form reads it.
    // A form that submits successfully proves the change event reached RHF.
    await forceTheme(page, "dark");
    await login(page);
    await page.goto("/dentist/settings", { waitUntil: "networkidle" });

    const combo = page.getByRole("combobox").first();
    await combo.click();
    await expect(page.getByRole("listbox")).toBeVisible();

    const option = page.getByRole("option").nth(1);
    const label = (await option.textContent())?.trim();
    await option.click();

    await expect(page.getByRole("listbox")).toBeHidden();
    // The trigger shows the new choice...
    await expect(combo).toContainText(label!);
    // ...and the native element underneath agrees.
    const inSync = await page.evaluate(() => {
      const sel = document.querySelector("select") as HTMLSelectElement;
      const btn = sel?.parentElement?.querySelector('[role="combobox"]');
      const chosen = sel?.selectedOptions[0]?.text?.trim();
      return { chosen, shown: btn?.textContent?.trim() };
    });
    expect(inSync.shown).toContain(inSync.chosen!);
  });

  test("the choice survives a failed server action", async ({ page }) => {
    // Regression: React 19 resets a <form action> once the action resolves.
    // That reset wiped the hidden <select> back to its first option, and React
    // does not re-apply the controlled value without a re-render — which a
    // failed sign-in does not cause. The login page then showed one clinic and
    // submitted a different one, so the next attempt failed too.
    await page.goto("/login");

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "My Dental Clinic" }).click();

    await page.getByPlaceholder("you@example.com").fill("brain@dentgrow.test");
    await page.getByPlaceholder("••••••••").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();

    const after = await page.evaluate(() => {
      const sel = document.querySelector("select") as HTMLSelectElement;
      const trigger = sel.parentElement!.querySelector('[role="combobox"]')!;
      return {
        native: sel.selectedOptions[0]?.text?.trim(),
        shown: trigger.textContent?.trim(),
      };
    });

    // Both the label the user reads and the value that would be posted.
    expect(after.shown).toContain("My Dental Clinic");
    expect(after.native).toBe("My Dental Clinic");

    // And a correct retry actually signs in. (The action reset clears the text
    // inputs — long-standing behaviour of this form, unrelated to the select.)
    await page.getByPlaceholder("you@example.com").fill("brain@dentgrow.test");
    await page.getByPlaceholder("••••••••").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dentist**", { timeout: 30_000 });
  });

  test("dropdowns inside a modal are not clipped", async ({ page }) => {
    await forceTheme(page, "dark");
    await login(page);
    await page.goto("/dentist/appointments/new", { waitUntil: "networkidle" });

    const combo = page.getByRole("combobox").first();
    await combo.click();

    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();

    // Rendered into <body>, so an overflow-auto ancestor cannot cut it off.
    const escaped = await page.evaluate(
      () => document.querySelector('[role="listbox"]')?.parentElement === document.body,
    );
    expect(escaped).toBe(true);

    const box = (await list.boundingBox())!;
    expect(box.height).toBeGreaterThan(0);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  });
});
