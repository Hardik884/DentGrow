/**
 * dev-local — run `next dev` against the LOCAL Supabase instance.
 *
 * Why this exists:
 *   `.env` in this repo points at the hosted Supabase project, so a plain
 *   `npm run dev` develops against production data. That is fine for a quick
 *   look at the deployed state, but it is the wrong target for anything that
 *   touches migrations, seeds or auth — and it is actively dangerous for a
 *   flow like sign-in, where testing means creating sessions.
 *
 *   Setting the variables inline (`VAR=x next dev`) does not work on Windows,
 *   where npm scripts run through cmd. So this wrapper sets them in
 *   process.env and spawns Next itself, which behaves identically everywhere.
 *
 * The values below match supabase/config.toml's local ports and the Supabase
 * CLI's fixed demo keys — the same ones playwright.config.ts uses. They are
 * identical on every local Supabase project by default and are not secrets.
 *
 * Usage:  npm run dev:local  [-- -p 3200]
 * Requires local Supabase to be running: npm run db:start
 */

import { spawn } from "node:child_process";

const LOCAL = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:55321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.LOCAL_SUPABASE_ANON_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};

const args = process.argv.slice(2);

const child = spawn("npx", ["next", "dev", ...args], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ...LOCAL },
});

child.on("exit", (code) => process.exit(code ?? 0));
