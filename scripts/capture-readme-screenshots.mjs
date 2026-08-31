/**
 * Captures the screenshots README.md embeds, from a real running instance.
 *
 * Committed so "re-shoot the README" is one command rather than a manual pass.
 *
 * ## Prerequisites
 *
 *   1. Local Supabase running            (npm run db:start)
 *   2. Dev server on :3200               (npm run dev:local -- -p 3200)
 *   3. The demo clinic's activity shifted so the app's own "today" lands on the
 *      densest seeded day, otherwise every screen shows an empty Tuesday.
 *      NOTE `queue_entries.queue_date` is a column in its own right and is NOT
 *      derived from `checked_in_at` — shift both, or the Live Queue renders
 *      "Queue is empty" while the database has patients waiting.
 *
 * ## Scope
 *
 * The seven dentist-facing screens only. The receptionist dashboard and the
 * patient portal are deliberately NOT here: the only clinic with a receptionist
 * profile and a portal-linked patient (Dr. Liying's) has no seeded appointments
 * at all, and the only clinic with real activity (BrightSmile, the demo clinic)
 * has neither. Capturing those two would replace their frames with empty states,
 * and inventing activity for them would make the README show data the product
 * never produced. Closing that gap is a seed change, not a capture change.
 *
 * Output is written straight over `assets/images/`, at the 1440x900 those files
 * already are. Captured at deviceScaleFactor 2 and downsampled, which is visibly
 * cleaner than rendering at 1x.
 *
 * Run: node scripts/capture-readme-screenshots.mjs
 */

import { chromium } from "@playwright/test";
import sharp from "sharp";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP = process.env.PMS_URL ?? "http://localhost:3200";
const EMAIL = process.env.PMS_EMAIL ?? "brain@dentgrow.test";
const PASSWORD = process.env.PMS_PASSWORD ?? "password123";
const OUT = "assets/images";

/** The size these files already are. */
const WIDTH = 1440;
const HEIGHT = 900;

const SCREENS = [
  { file: "dentist-dashboard", path: "/dentist" },
  { file: "dentist-appointments", path: "/dentist/appointments" },
  { file: "dentist-queue", path: "/dentist/queue" },
  { file: "dentist-patients", path: "/dentist/patients" },
  { file: "dentist-follow-ups", path: "/dentist/follow-ups" },
  { file: "dentist-payments", path: "/dentist/payments" },
  { file: "business-brain", path: "/dentist/business-brain" },
];

const staging = await mkdtemp(join(tmpdir(), "oramedha-readme-"));
const browser = await chromium.launch();

try {
  const auth = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  {
    const page = await auth.newPage();
    await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("you@clinic.com").fill(EMAIL);
    await page.getByPlaceholder("Enter your password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dentist/, { timeout: 30_000 });
    await page.close();
  }
  const storageState = await auth.storageState();
  await auth.close();

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    timezoneId: "Asia/Kolkata",
    colorScheme: "light",
    storageState,
  });

  for (const { file, path } of SCREENS) {
    const page = await context.newPage();
    await page.goto(`${APP}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    // Scrollbars differ per platform, and the Next.js dev-tools bubble is the one
    // thing in these frames that is not the product. Both are hidden — the bubble
    // is visible in the frames this script replaces.
    await page.addStyleTag({
      content: `*::-webkit-scrollbar{display:none!important}
                html{scrollbar-width:none!important}
                *{caret-color:transparent!important}
                nextjs-portal,
                [data-nextjs-dev-tools-button],
                [data-nextjs-toast],
                #__next-build-watcher{display:none!important}`,
    });
    await page.waitForTimeout(1200);

    const raw = join(staging, `${file}.png`);
    await page.screenshot({ path: raw });
    await sharp(raw)
      .resize(WIDTH, HEIGHT, { fit: "fill" })
      .png({ compressionLevel: 9 })
      .toFile(`${OUT}/${file}.png`);
    console.log(`${OUT}/${file}.png  ${WIDTH}x${HEIGHT}`);
    await page.close();
  }

  await context.close();
} finally {
  await browser.close();
  await rm(staging, { recursive: true, force: true });
}

console.log("done");
