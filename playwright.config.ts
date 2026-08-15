import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the Billing & Payments e2e specs (e2e/*.spec.ts).
 *
 * Runs against a DEDICATED dev server on port 3100 (never the port a
 * developer might already be running `npm run dev` on for manual testing),
 * pointed at the LOCAL Supabase instance — never the linked remote project.
 *
 * Requires local Supabase to be running and reset with the seed data first:
 *   npm run db:start && npm run db:reset
 * The seeded logins this suite uses (see supabase/seed.sql):
 *   dentist@dentgrow.test / password123        → "Dr. Liying's Dental Care"
 *   brain@dentgrow.test  / password123        → "My Dental Clinic" (demo billing data)
 *
 * If local Supabase isn't reachable, specs skip themselves gracefully rather
 * than failing with a confusing connection error — same convention as the
 * `reachable()` guard in actions/__tests__/billing-charges.spec.ts.
 */

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

// Defaults match this repo's supabase/config.toml local ports. Override via
// env if a different local Supabase instance/port is in use.
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:55321";
const SUPABASE_ANON_KEY =
  process.env.E2E_SUPABASE_ANON_KEY ??
  // Supabase CLI's fixed, public "demo" anon key — identical on every local
  // project by default, not a secret.
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export default defineConfig({
  testDir: "./e2e",
  // Generous timeouts: the dev server compiles each App Router route lazily on
  // its first hit, so the first test to open a given page (e.g. the bill route)
  // can wait ~20s for cold compilation. These cover that without masking real
  // failures.
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: SUPABASE_SERVICE_ROLE_KEY,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
