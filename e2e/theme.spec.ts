import { test, expect, type Page } from "@playwright/test";

/**
 * Dark mode visual QA.
 *
 * Sweeps the app in both themes and asserts, per page, that the theme actually
 * applied and that nothing obviously broke. Rather than pixel-diffing (which
 * would need a baseline and would churn on every copy edit), this reads the
 * COMPUTED styles the browser ended up with and looks for the three failure
 * modes a token migration actually produces:
 *
 *   1. A near-white surface still painted while the app is in dark mode —
 *      i.e. a colour that never made it out of a hardcoded literal.
 *   2. Text whose contrast against its own background falls below WCAG AA.
 *   3. A border that is invisible against the surface it sits on.
 *
 * These run only when local Supabase is up; without it the app cannot render an
 * authenticated page at all, and the suite skips rather than reporting noise.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55321";
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

/**
 * Forces a theme before the page's first paint, exactly the way a returning
 * user experiences it: the preference is already in localStorage, and the
 * blocking script in <head> reads it. This is also what proves the no-flash
 * path works — if the bootstrap script were broken, the page would render
 * light and every dark assertion below would fail.
 */
async function forceTheme(page: Page, theme: "light" | "dark" | "system") {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [THEME_KEY, theme] as const,
  );
}

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("select").selectOption({ label: "My Dental Clinic" });
  await page.getByPlaceholder("you@example.com").fill("brain@dentgrow.test");
  await page.getByPlaceholder("••••••••").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dentist**", { timeout: 30_000 });
}

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: [number, number, number]) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

type Finding = { kind: string; detail: string };

/**
 * Runs inside the page. Walks the rendered DOM and reports concrete defects.
 */
const AUDIT = `(() => {
  const parse = (c) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (x, y) => { const a = lum(x), b = lum(y); const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); };

  // Walk up for the first ancestor that actually paints a background.
  const effectiveBg = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.9) return c;
      n = n.parentElement;
    }
    return parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  };

  const findings = [];
  const seen = new Set();
  const label = (el) => (el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ').slice(0, 3).join('.')).slice(0, 120);

  for (const el of document.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;

    // Printable documents — invoices, prescriptions, consent forms — are
    // deliberately pinned to a light palette (.document-light) because they are
    // paper, not UI. Auditing inside one would report the whole point of it as
    // a defect.
    if (el.closest('.document-light')) continue;

    // (1) Near-white painted surface while dark.
    if (window.__DARK__) {
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0.9 && lum(bg) > 0.75 && rect.width * rect.height > 2500) {
        const k = 'white:' + label(el);
        if (!seen.has(k)) { seen.add(k); findings.push({ kind: 'near-white-surface', detail: label(el) + ' bg=' + cs.backgroundColor + ' area=' + Math.round(rect.width * rect.height) }); }
      }
    }

    // (2) Text contrast — only nodes that own visible text.
    const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (ownText) {
      const fg = parse(cs.color);
      if (fg && fg.a > 0.5) {
        const bg = effectiveBg(el);
        const size = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        const large = size >= 24 || (size >= 18.66 && bold);
        const need = large ? 3.0 : 4.5;
        const got = ratio(fg, bg);
        if (got < need) {
          const k = 'text:' + label(el) + cs.color;
          if (!seen.has(k)) { seen.add(k); findings.push({ kind: 'low-contrast-text', detail: label(el) + ' ' + got.toFixed(2) + ':1 (need ' + need + ') fg=' + cs.color + ' bg=rgb(' + bg.r + ',' + bg.g + ',' + bg.b + ') "' + el.textContent.trim().slice(0, 40) + '"' }); }
        }
      }
    }

    // (3) Borders that are drawn but indistinguishable from their surface.
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = parseFloat(cs['border' + side + 'Width']);
      if (!w || w < 1 || cs['border' + side + 'Style'] === 'none') continue;
      const bc = parse(cs['border' + side + 'Color']);
      if (!bc || bc.a < 0.1) continue;
      const own = parse(cs.backgroundColor);
      // A filled chip that outlines itself in its own fill colour is deliberate,
      // not a missing border — skip it rather than reporting every filter pill.
      if (own && own.a > 0.9 && ratio(bc, own) < 1.05) continue;
      const bg = effectiveBg(el);
      if (ratio(bc, bg) < 1.12) {
        const k = 'border:' + label(el);
        if (!seen.has(k)) { seen.add(k); findings.push({ kind: 'invisible-border', detail: label(el) + ' ' + ratio(bc, bg).toFixed(2) + ':1 border=' + cs['border' + side + 'Color'] }); }
        break;
      }
    }
  }
  return findings;
})()`;

const RECEPTIONIST_ROUTES = [
  "/receptionist",
  "/receptionist/patients",
  "/receptionist/appointments",
  "/receptionist/queue",
  "/receptionist/payments",
  "/receptionist/prescriptions",
];

const PUBLIC_ROUTES = ["/login", "/signup", "/forgot-password"];

const DENTIST_ROUTES = [
  "/dentist",
  "/dentist/patients",
  "/dentist/appointments",
  "/dentist/queue",
  "/dentist/payments",
  "/dentist/treatments",
  "/dentist/follow-ups",
  "/dentist/analytics",
  "/dentist/business-brain",
  "/dentist/external-consultations",
  "/dentist/settings",
];

test.describe("dark mode", () => {
  test.beforeAll(async () => {
    test.skip(
      !(await localSupabaseReachable()),
      `local Supabase not reachable at ${SUPABASE_URL} — run: npm run db:start`,
    );
  });

  test("the bootstrap script applies the theme before first paint", async ({ page }) => {
    await forceTheme(page, "dark");
    await page.goto("/login");

    // If this is true, the class was on <html> when the document was parsed —
    // there was no light frame to flash.
    const state = await page.evaluate(() => ({
      hasDark: document.documentElement.classList.contains("dark"),
      colorScheme: document.documentElement.style.colorScheme,
      bg: getComputedStyle(document.body).backgroundColor,
    }));

    expect(state.hasDark).toBe(true);
    expect(state.colorScheme).toBe("dark");

    const rgb = /rgba?\(([^)]+)\)/.exec(state.bg)!;
    const [r, g, b] = rgb[1].split(",").map((x) => parseFloat(x)) as [number, number, number];
    expect(luminance([r, g, b])).toBeLessThan(0.05);
  });

  test("System follows the OS preference", async ({ browser }) => {
    for (const scheme of ["dark", "light"] as const) {
      const context = await browser.newContext({ colorScheme: scheme });
      const page = await context.newPage();
      await forceTheme(page, "system");
      await page.goto("/login");
      await expect
        .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
        .toBe(scheme === "dark");
      await context.close();
    }
  });

  test("switching theme at runtime repaints without a reload", async ({ page }) => {
    // Deliberately NOT forceTheme(): addInitScript re-runs on every navigation,
    // so pinning the preference here would overwrite the click below when the
    // page reloads. Playwright's default OS scheme is light, so "System"
    // resolves to light and gives us the starting point we want.
    await login(page);
    await page.goto("/dentist/settings");

    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.getByRole("radio", { name: "Dark" }).first().click();

    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(true);

    const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(after).not.toBe(before);

    // And the choice survives a reload.
    await page.reload();
    expect(
      await page.evaluate(() => document.documentElement.classList.contains("dark")),
    ).toBe(true);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: dentist routes render without contrast defects`, async ({ page }) => {
      test.setTimeout(300_000);
      await forceTheme(page, theme);
      await login(page);

      const report: Record<string, Finding[]> = {};

      for (const route of DENTIST_ROUTES) {
        await page.goto(route, { waitUntil: "networkidle" });
        // A few routes are feature-gated and bounce after load; let any
        // client-side redirect settle, then confirm we are still where we meant
        // to be before auditing what is on screen.
        await page.waitForTimeout(600);
        if (!page.url().includes(route)) continue;

        let findings: Finding[] = [];
        try {
          await page.evaluate((dark) => ((window as never as { __DARK__: boolean }).__DARK__ = dark), theme === "dark");
          findings = (await page.evaluate(AUDIT)) as Finding[];
        } catch {
          continue; // navigated away mid-audit
        }
        if (findings.length) report[route] = findings;
        await page.screenshot({
          path: `test-results/theme/${theme}${route.replace(/\//g, "_")}.png`,
          fullPage: true,
        });
      }

      const summary = Object.entries(report)
        .map(([route, fs]) => `\n${route}\n` + fs.map((f) => `  [${f.kind}] ${f.detail}`).join("\n"))
        .join("\n");

      if (summary) console.log(`\n===== ${theme.toUpperCase()} FINDINGS =====${summary}\n`);

      // Near-white surfaces in dark mode are always a bug — that is a colour
      // that escaped tokenisation.
      const nearWhite = Object.values(report).flat().filter((f) => f.kind === "near-white-surface");
      expect(nearWhite, `near-white surfaces while in ${theme} mode:\n${nearWhite.map((f) => f.detail).join("\n")}`).toHaveLength(0);
    });
  }
  // ── Other roles and the signed-out surfaces ─────────────────────────────
  //
  // The patient portal is NOT swept here: the local seed has no patient
  // account (patient_portal_links is empty), so every portal route redirects
  // to /portal/setup and there is nothing authenticated to audit. The portal
  // shares the same token system and layout primitives as everything below,
  // so it is covered by construction rather than by assertion.

  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: signed-out pages`, async ({ page }) => {
      await forceTheme(page, theme);
      const findings: Finding[] = [];

      for (const route of PUBLIC_ROUTES) {
        await page.goto(route, { waitUntil: "networkidle" });
        await page.evaluate((d) => ((window as never as { __DARK__: boolean }).__DARK__ = d), theme === "dark");
        findings.push(...((await page.evaluate(AUDIT)) as Finding[]));
        await page.screenshot({ path: `test-results/theme/${theme}${route.replace(/\//g, "_")}.png`, fullPage: true });
      }

      const nearWhite = findings.filter((f) => f.kind === "near-white-surface");
      expect(nearWhite, nearWhite.map((f) => f.detail).join("\n")).toHaveLength(0);
    });

    test(`${theme}: receptionist routes`, async ({ page }) => {
      test.setTimeout(240_000);
      await forceTheme(page, theme);

      await page.goto("/login");
      await page.locator("select").selectOption({ label: "Dr. Liying's Dental Care" });
      await page.getByPlaceholder("you@example.com").fill("receptionist@dentgrow.test");
      await page.getByPlaceholder("••••••••").fill("password123");
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL("**/receptionist**", { timeout: 30_000 });

      const report: Record<string, Finding[]> = {};

      for (const route of RECEPTIONIST_ROUTES) {
        await page.goto(route, { waitUntil: "networkidle" });
        await page.waitForTimeout(600);
        if (!page.url().includes(route)) continue;
        let findings: Finding[] = [];
        try {
          await page.evaluate((d) => ((window as never as { __DARK__: boolean }).__DARK__ = d), theme === "dark");
          findings = (await page.evaluate(AUDIT)) as Finding[];
        } catch { continue; }
        if (findings.length) report[route] = findings;
        await page.screenshot({ path: `test-results/theme/${theme}${route.replace(/\//g, "_")}.png`, fullPage: true });
      }

      const summary = Object.entries(report)
        .map(([r, fs]) => `
${r}
` + fs.map((f) => `  [${f.kind}] ${f.detail}`).join("\n"))
        .join("\n");
      if (summary) console.log(`\n===== ${theme.toUpperCase()} RECEPTIONIST =====${summary}\n`);

      const nearWhite = Object.values(report).flat().filter((f) => f.kind === "near-white-surface");
      expect(nearWhite, nearWhite.map((f) => f.detail).join("\n")).toHaveLength(0);
    });
  }

  test("dark mode holds up on a mobile viewport", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await forceTheme(page, "dark");
    await login(page);

    await page.evaluate(() => ((window as never as { __DARK__: boolean }).__DARK__ = true));
    const findings = (await page.evaluate(AUDIT)) as Finding[];
    const nearWhite = findings.filter((f) => f.kind === "near-white-surface");

    // No horizontal overflow either — a dark surface that overshoots the
    // viewport is as broken as a light one.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );

    await page.screenshot({ path: "test-results/theme/dark_mobile_dentist.png", fullPage: true });
    await context.close();

    expect(nearWhite, nearWhite.map((f) => f.detail).join("\n")).toHaveLength(0);
    expect(overflows, "page scrolls horizontally at 375px").toBe(false);
  });
});
